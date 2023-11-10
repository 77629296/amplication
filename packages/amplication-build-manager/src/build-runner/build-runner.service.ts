import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DSGResourceData } from "@amplication/code-gen-types";
import axios from "axios";
import { promises as fs } from "fs";
import { copy } from "fs-extra";
import { join, dirname } from "path";
import { Env } from "../env";
import { Traceable } from "@amplication/opentelemetry-nestjs";
import { CodeGeneratorSplitterService } from "../code-generator/code-generator-splitter.service";
import { KafkaProducerService } from "@amplication/util/nestjs/kafka";
import {
  CodeGenerationFailure,
  CodeGenerationSuccess,
  KAFKA_TOPICS,
} from "@amplication/schema-registry";
import { BuildId, JobBuildId, EnumJobStatus } from "../types";
import { AmplicationLogger } from "@amplication/util/nestjs/logging";
import { CodeGeneratorService } from "../code-generator/code-generator-catalog.service";

@Traceable()
@Injectable()
export class BuildRunnerService {
  constructor(
    private readonly configService: ConfigService<Env, true>,
    private readonly producerService: KafkaProducerService,
    private readonly codeGeneratorService: CodeGeneratorService,
    private readonly codeGeneratorSplitterService: CodeGeneratorSplitterService,
    private readonly logger: AmplicationLogger
  ) {}

  async runBuilds(
    resourceId: string,
    buildId: string,
    dsgResourceData: DSGResourceData
  ) {
    try {
      const codeGeneratorVersion =
        await this.codeGeneratorService.getCodeGeneratorVersion({
          codeGeneratorVersion:
            dsgResourceData.resourceInfo.codeGeneratorVersionOptions
              .codeGeneratorVersion,
          codeGeneratorStrategy:
            dsgResourceData.resourceInfo.codeGeneratorVersionOptions
              .codeGeneratorStrategy,
        });

      const jobs = await this.codeGeneratorSplitterService.splitBuildsIntoJobs(
        dsgResourceData,
        buildId
      );
      for (const [jobBuildId, data] of jobs) {
        this.logger.debug("Running job for...", { jobBuildId });
        await this.saveDsgResourceData(jobBuildId, data, codeGeneratorVersion);

        const url = this.configService.get(Env.DSG_RUNNER_URL);
        try {
          await axios.post(url, {
            resourceId: resourceId,
            buildId: jobBuildId,
            codeGeneratorVersion,
          });
        } catch (error) {
          throw new Error(error.message, {
            cause: {
              code: error.response?.status,
              message: error.response?.data?.message,
              data: error.config?.data,
            },
          });
        }
      }
    } catch (error) {
      this.logger.error(error.message, error);
      await this.emitCodeGenerationFailureEvent(buildId, error);
    }
  }

  async processBuildResult(
    resourceId: string,
    jobBuildId: string,
    jobStatus: EnumJobStatus,
    error?: Error
  ) {
    switch (jobStatus) {
      case EnumJobStatus.Failure:
        return this.emitCodeGenerationFailureWhenJobStatusSetAsFailed(
          jobBuildId as JobBuildId<BuildId>,
          error
        );
      case EnumJobStatus.Success:
        return this.emitKafkaEventBasedOnJobStatus(
          resourceId,
          jobBuildId as JobBuildId<BuildId>
        );
      default:
        throw new Error("Unexpected EnumJobStatus", {
          cause: { jobBuildId, jobStatus, error },
        });
    }
  }

  /**
   * Emits a kafka event based on the job status (success / failure) from the redis cache
   * @param resourceId the resource id
   * @param buildId the original buildId without the suffix (domain name)
   * @param codeGeneratorVersion the code generator version
   */
  async emitKafkaEventBasedOnJobStatus(
    resourceId: string,
    jobBuildId: JobBuildId<BuildId>
  ) {
    const buildId =
      this.codeGeneratorSplitterService.extractBuildId(jobBuildId);
    const codeGeneratorVersion = await this.getCodeGeneratorVersion(jobBuildId);
    try {
      const isCopySucceeded = await this.copyFromJobToArtifact(
        resourceId,
        jobBuildId
      );

      isCopySucceeded
        ? await this.codeGeneratorSplitterService.setJobStatus(
            jobBuildId,
            EnumJobStatus.Success
          )
        : await this.codeGeneratorSplitterService.setJobStatus(
            jobBuildId,
            EnumJobStatus.Failure
          );

      const buildStatus =
        await this.codeGeneratorSplitterService.getBuildStatus(buildId);

      if (buildStatus === EnumJobStatus.InProgress) {
        // do nothing
        return;
      }

      if (buildStatus === EnumJobStatus.Success) {
        await this.emitCodeGenerationSuccessEvent({
          buildId,
          codeGeneratorVersion,
        });
      } else if (buildStatus === EnumJobStatus.Failure) {
        await this.emitCodeGenerationFailureEvent(
          buildId,
          new Error(`Code generation failed for ${buildId}`)
        );
      }
    } catch (error) {
      this.logger.error(error.message, error);
      await this.emitCodeGenerationFailureEvent(buildId, error);
    }
  }

  async emitCodeGenerationFailureWhenJobStatusSetAsFailed(
    jobBuildId: JobBuildId<BuildId>,
    error: Error
  ) {
    try {
      const buildId =
        this.codeGeneratorSplitterService.extractBuildId(jobBuildId);

      const getCurrentJobStatus =
        await this.codeGeneratorSplitterService.getBuildStatus(buildId);

      if (getCurrentJobStatus === EnumJobStatus.Failure) {
        // do nothing because that means that we already set the build status as failure and emitted the event
        return;
      }

      await this.codeGeneratorSplitterService.setJobStatus(
        jobBuildId,
        EnumJobStatus.Failure
      );

      const buildStatus =
        await this.codeGeneratorSplitterService.getBuildStatus(buildId);

      if (buildStatus === EnumJobStatus.Failure) {
        await this.emitCodeGenerationFailureEvent(buildId, error);
      }
    } catch (error) {
      this.logger.error(error.message, error);
      await this.emitCodeGenerationFailureEvent(jobBuildId, error);
    }
  }

  async emitCodeGenerationSuccessEvent(
    codeGenerationSuccess: CodeGenerationSuccess.Value
  ) {
    try {
      // extract build id although sometimes it is not needed because the build id is already extracted
      const buildId = this.codeGeneratorSplitterService.extractBuildId(
        codeGenerationSuccess.buildId as JobBuildId<BuildId>
      );

      const successEvent: CodeGenerationSuccess.KafkaEvent = {
        key: null,
        value: { ...codeGenerationSuccess, buildId },
      };

      await this.producerService.emitMessage(
        KAFKA_TOPICS.CODE_GENERATION_SUCCESS_TOPIC,
        successEvent
      );
    } catch (error) {
      this.logger.error(error.message, error);
    }
  }

  async emitCodeGenerationFailureEvent(jobBuildId: string, error: Error) {
    try {
      // extract build id although sometimes it is not needed because the build id is already extracted
      const buildId = this.codeGeneratorSplitterService.extractBuildId(
        jobBuildId as JobBuildId<BuildId>
      );

      const codeGeneratorVersion = await this.getCodeGeneratorVersion(
        jobBuildId
      );

      const failureEvent: CodeGenerationFailure.KafkaEvent = {
        key: null,
        value: { buildId, codeGeneratorVersion, error },
      };

      await this.producerService.emitMessage(
        KAFKA_TOPICS.CODE_GENERATION_FAILURE_TOPIC,
        failureEvent
      );
    } catch (error) {
      this.logger.error(error.message, error);
    }
  }

  async saveDsgResourceData(
    buildId: string,
    dsgResourceData: DSGResourceData,
    codeGeneratorVersion: string
  ) {
    const savePath = join(
      this.configService.get(Env.DSG_JOBS_BASE_FOLDER),
      buildId,
      this.configService.get(Env.DSG_JOBS_RESOURCE_DATA_FILE)
    );

    const saveDir = dirname(savePath);
    await fs.mkdir(saveDir, { recursive: true });

    await fs.writeFile(
      savePath,
      JSON.stringify({ ...dsgResourceData, codeGeneratorVersion })
    );
  }

  async getCodeGeneratorVersion(buildId: string) {
    const data = await fs.readFile(
      join(
        this.configService.get(Env.DSG_JOBS_BASE_FOLDER),
        buildId,
        this.configService.get(Env.DSG_JOBS_RESOURCE_DATA_FILE)
      )
    );

    const config = <DSGResourceData & { codeGeneratorVersion: string }>(
      JSON.parse(data.toString())
    );

    return config.codeGeneratorVersion;
  }

  async copyFromJobToArtifact(
    resourceId: string,
    jobBuildId: string
  ): Promise<boolean> {
    const buildId = this.codeGeneratorSplitterService.extractBuildId(
      jobBuildId as JobBuildId<BuildId>
    );

    try {
      const jobPath = join(
        this.configService.get(Env.DSG_JOBS_BASE_FOLDER),
        jobBuildId,
        this.configService.get(Env.DSG_JOBS_CODE_FOLDER)
      );

      const artifactPath = join(
        this.configService.get(Env.BUILD_ARTIFACTS_BASE_FOLDER),
        resourceId,
        buildId
      );

      await copy(jobPath, artifactPath);
      return true;
    } catch (error) {
      this.logger.error(error.message, error);
      return false;
    }
  }
}
