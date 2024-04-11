import { AmplicationLogger } from "@amplication/util/nestjs/logging";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { Env } from "../../env";
import { AssistantThread } from "./dto/AssistantThread";
import { TextContentBlock } from "openai/resources/beta/threads/messages/messages";
import { EnumAssistantMessageRole } from "./dto/EnumAssistantMessageRole";
import { Run } from "openai/resources/beta/threads/runs/runs";
import { AssistantContext } from "./dto/AssistantContext";
import { EntityService } from "../entity/entity.service";
import { plural } from "pluralize";
import { camelCase } from "camel-case";
import { ResourceService } from "../resource/resource.service";
import { EnumResourceType } from "../resource/dto/EnumResourceType";
import { ModuleService } from "../module/module.service";
import { ProjectService } from "../project/project.service";

enum EnumAssistantFunctions {
  CreateEntity = "createEntity",
  GetProjectServices = "getProjectServices",
  GetServiceEntities = "getServiceEntities",
  CreateService = "createService",
  CreateProject = "createProject",
}

type MessageLoggerContext = {
  messageContext: {
    workspaceId: string;
    projectId: string;
    serviceId: string;
  };
  threadId: string;
  userId: string;
  role: string;
  functionName?: string;
  params?: string;
};

@Injectable()
export class AssistantService {
  private assistantId: string;
  private openai: OpenAI;
  private clientHost: string;
  constructor(
    @Inject(AmplicationLogger)
    private readonly logger: AmplicationLogger,
    private readonly entityService: EntityService,
    private readonly resourceService: ResourceService,
    private readonly moduleService: ModuleService,
    private readonly projectService: ProjectService,

    configService: ConfigService
  ) {
    this.logger.info("starting assistant service");

    this.openai = new OpenAI({
      apiKey: configService.get<string>(Env.CHAT_OPENAI_KEY),
    });

    (this.clientHost = configService.get<string>(Env.CLIENT_HOST)),
      (this.assistantId = configService.get<string>(Env.CHAT_ASSISTANT_ID));
  }

  //do not expose the entire context as it may include sensitive information
  getShortMessageContext(context: AssistantContext) {
    return {
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      serviceId: context.resourceId, //@TODO: check type? //we use service id implicitly to help the assistant differentiate between different resources
    };
  }

  async processMessage(
    messageText: string,
    threadId: string,
    context: AssistantContext
  ): Promise<AssistantThread> {
    const openai = this.openai;

    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
    }

    const shortContext = this.getShortMessageContext(context);
    const loggerContext: MessageLoggerContext = {
      messageContext: shortContext,
      threadId,
      userId: context.user.id,
      role: "user",
    };

    this.logger.info(`Chat: ${messageText}`, loggerContext);

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: messageText,
    });

    const run = await openai.beta.threads.runs.createAndPoll(threadId, {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      assistant_id: this.assistantId,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      additional_instructions: `The following context is available: 
        ${JSON.stringify(shortContext)}`,
    });

    return this.handleRunStatus(run, threadId, context, loggerContext);
  }

  async handleRunStatus(
    run: Run,
    threadId: string,
    context: AssistantContext,
    loggerContext: MessageLoggerContext
  ): Promise<AssistantThread> {
    const openai = this.openai;

    const assistantThread = new AssistantThread();
    assistantThread.id = threadId;
    assistantThread.messages = [];

    this.logger.debug(`Run status: ${run.status}`);

    if (run.status === "completed") {
      const messages = await openai.beta.threads.messages.list(threadId, {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        run_id: run.id,
      });
      for (const message of messages.data.reverse()) {
        const textContentBlock = message.content[0] as TextContentBlock;
        const messageText = textContentBlock.text.value;
        loggerContext.role = message.role;

        this.logger.info(`Chat: ${messageText}`, loggerContext);

        assistantThread.messages.push({
          id: message.id,
          role:
            message.role === "user"
              ? EnumAssistantMessageRole.User
              : EnumAssistantMessageRole.Assistant,
          text: messageText,
          createdAt: new Date(message.created_at),
        });
      }

      return assistantThread;
    } else if (run.status === "requires_action") {
      const requiredActions =
        run.required_action.submit_tool_outputs.tool_calls;

      const functionCalls = await Promise.all(
        requiredActions.map((action) => {
          const functionName = action.function.name;
          const params = action.function.arguments;

          return this.executeFunction(
            action.id,
            functionName,
            params,
            context,
            loggerContext
          );
        })
      );

      const innerRun = await openai.beta.threads.runs.submitToolOutputsAndPoll(
        threadId,
        run.id,
        {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          tool_outputs: functionCalls.map((call) => ({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            tool_call_id: call.callId,
            output: call.results,
          })),
        }
      );

      return this.handleRunStatus(innerRun, threadId, context, loggerContext);
    } else {
      //@todo: handle other statuses
      this.logger.error(
        `Chat: Run status: ${run.status}. Error: ${run.last_error}`,
        null,
        loggerContext
      );

      assistantThread.messages.push({
        id: Date.now().toString(), //use timestamp as id to be unique at the client
        role: EnumAssistantMessageRole.Assistant,
        text: run.last_error.message || "Sorry, I'm having trouble right now.",
        createdAt: new Date(),
      });
      return assistantThread;
    }
  }

  async executeFunction(
    callId: string,
    functionName: string,
    params: string,
    context: AssistantContext,
    loggerContext: MessageLoggerContext
  ): Promise<{
    callId: string;
    results: string;
  }> {
    loggerContext.functionName = functionName;
    loggerContext.params = params;

    this.logger.info(`Chat: Executing function.`, loggerContext);

    const args = JSON.parse(params);

    if (this.assistantFunctions[functionName] !== undefined) {
      try {
        return {
          callId,
          results: JSON.stringify(
            await this.assistantFunctions[functionName].apply(null, [
              args,
              context,
            ])
          ),
        };
      } catch (error) {
        this.logger.error(
          `Chat: Error executing function: ${error.message}`,
          error,
          loggerContext
        );
        return {
          callId,
          results: JSON.stringify(error.message),
        };
      }
    } else {
      this.logger.error(
        `Chat: Function not found: ${functionName}`,
        null,
        loggerContext
      );
      return {
        callId,
        results: "Function not found",
      };
    }
  }

  private assistantFunctions: {
    [key in EnumAssistantFunctions]: (
      args: any,
      context: AssistantContext
    ) => any;
  } = {
    createEntity: async (
      args: { name: string; serviceId: string; fields: string[] },
      context: AssistantContext
    ): Promise<any> => {
      let pluralDisplayName = plural(args.name);
      if (pluralDisplayName === args.name) {
        pluralDisplayName = `${args.name}Items`;
      }
      const entity = await this.entityService.createOneEntity(
        {
          data: {
            displayName: args.name,
            pluralDisplayName: pluralDisplayName,
            name: camelCase(args.name),
            resource: {
              connect: {
                id: args.serviceId,
              },
            },
          },
        },
        context.user
      );

      if (args.fields && args.fields.length > 0) {
        await Promise.all(
          args.fields.map(async (field) => {
            await this.entityService.createFieldByDisplayName(
              {
                data: {
                  displayName: field,
                  entity: {
                    connect: {
                      id: entity.id,
                    },
                  },
                },
              },
              context.user
            );
          })
        );
      }

      const defaultModuleId =
        await this.moduleService.getDefaultModuleIdForEntity(
          args.serviceId,
          entity.id
        );

      return {
        entityLink: `${this.clientHost}/${context.workspaceId}/${context.projectId}/${args.serviceId}/entities/${entity.id}`,
        apisLink: `${this.clientHost}/${context.workspaceId}/${context.projectId}/${args.serviceId}/modules/${defaultModuleId}`,
        result: entity,
      };
    },
    getProjectServices: async (
      args: { projectId: string },
      context: AssistantContext
    ) => {
      const resources = await this.resourceService.resources({
        where: {
          project: { id: args.projectId },
          resourceType: { equals: EnumResourceType.Service },
        },
      });
      return resources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        description: resource.description,
        link: `${this.clientHost}/${context.workspaceId}/${context.projectId}/${resource.id}`,
      }));
    },
    getServiceEntities: async (
      args: { serviceId: string },
      context: AssistantContext
    ) => {
      const entities = await this.entityService.entities({
        where: {
          resource: { id: args.serviceId },
        },
      });
      return entities.map((entity) => ({
        id: entity.id,
        name: entity.displayName,
        description: entity.description,
        link: `${this.clientHost}/${context.workspaceId}/${context.projectId}/${context.resourceId}/entities/${entity.id}`,
      }));
    },
    createService: async (
      args: {
        serviceName: string;
        serviceDescription?: string;
        projectId: string;
        adminUIPath: string;
        serverPath: string;
      },
      context: AssistantContext
    ) => {
      const resource =
        await this.resourceService.createServiceWithDefaultSettings(
          args.serviceName,
          args.serviceDescription || "",
          args.projectId,
          args.adminUIPath,
          args.serverPath,
          context.user
        );
      return {
        link: `${this.clientHost}/${context.workspaceId}/${args.projectId}/${resource.id}`,
        result: {
          id: resource.id,
          name: resource.name,
          description: resource.description,
        },
      };
    },
    createProject: async (
      args: { projectName: string },
      context: AssistantContext
    ) => {
      const project = await this.projectService.createProject(
        {
          data: {
            name: args.projectName,
            workspace: {
              connect: {
                id: context.workspaceId,
              },
            },
          },
        },
        context.user.id
      );
      return {
        link: `${this.clientHost}/${context.workspaceId}/${project.id}`,
        connectToGitLink: `${this.clientHost}/${context.workspaceId}/${project.id}/git-sync`,
        result: {
          id: project.id,
          name: project.name,
        },
      };
    },
  };
}
