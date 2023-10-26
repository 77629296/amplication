import { join, dirname } from "node:path";
import { MakeDirectoryOptions, promises } from "node:fs";
import { MockedAmplicationLoggerProvider } from "@amplication/util/nestjs/logging/test-utils";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { DSGResourceData } from "@amplication/code-gen-types";
import { BuildRunnerService } from "./build-runner.service";
import { Env } from "../env";

const spyOnMkdir = jest.spyOn(promises, "mkdir");
const spyOnWriteFile = jest.spyOn(promises, "writeFile");

spyOnMkdir.mockImplementation(
  (dirName: string, options: MakeDirectoryOptions) => {
    return Promise.resolve(
      options?.recursive ? dirName.split("/").shift() : undefined
    );
  }
);
spyOnWriteFile.mockResolvedValue(undefined);

describe("BuildRunnerService", () => {
  let service: BuildRunnerService;
  let configService: ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (variable) => {
              switch (variable) {
                case Env.DSG_JOBS_BASE_FOLDER:
                  return "dsg/jobs/base-dir/";
                case Env.DSG_JOBS_RESOURCE_DATA_FILE:
                  return "dsg/jobs/resource-data-file/";
                case Env.DSG_JOBS_CODE_FOLDER:
                  return "dsg/jobs/code-dir/";
                case Env.BUILD_ARTIFACTS_BASE_FOLDER:
                  return "build/artifacts/base-dir/";
                default:
                  return "";
              }
            },
          },
        },
        MockedAmplicationLoggerProvider,
        BuildRunnerService,
      ],
    }).compile();

    service = module.get<BuildRunnerService>(BuildRunnerService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should save DSG resource data in the appropriate dir, based on the `buildId`", async () => {
    const buildId = "buildId";
    const dsgResourceDataMock: DSGResourceData = {
      buildId,
      resourceType: "Service",
      pluginInstallations: [],
    };
    const codeGeneratorVersion = "v1.0.0";

    await service.saveDsgResourceData(
      buildId,
      dsgResourceDataMock,
      codeGeneratorVersion
    );

    const savePath = join(
      configService.get(Env.DSG_JOBS_BASE_FOLDER),
      buildId,
      configService.get(Env.DSG_JOBS_RESOURCE_DATA_FILE)
    );
    const dirName = dirname(savePath);

    expect(spyOnMkdir).toBeCalledWith(dirName, { recursive: true });
    await expect(promises.mkdir(dirName, { recursive: true })).resolves.toEqual(
      configService.get(Env.DSG_JOBS_BASE_FOLDER).split("/").shift()
    );

    expect(spyOnWriteFile).toBeCalledWith(
      savePath,
      JSON.stringify({ ...dsgResourceDataMock, codeGeneratorVersion })
    );
    await expect(
      promises.writeFile(
        savePath,
        JSON.stringify({ ...dsgResourceDataMock, codeGeneratorVersion })
      )
    ).resolves.not.toThrow();
  });
});
