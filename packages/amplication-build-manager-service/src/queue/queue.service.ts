import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

export const KAFKA_CLIENT = 'KAFKA_CLIENT';

@Injectable()
export class QueueService {
  constructor(
    @Inject(KAFKA_CLIENT)
    private readonly kafkaClient: ClientKafka,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  emitMessage(topic: string, message: string): void {
    const logger = this.logger;
    const observer = {
      error(error: Error): void {
        logger.error(
          `failed to push message to kafka: method: emitMessage topic: ${topic}, message: ${message} error: ${error}`,
          { error, class: QueueService.name, topic, message },
        );
      },
    };

    const response = this.kafkaClient.emit(topic, message);
    response.subscribe(observer);
  }
}
