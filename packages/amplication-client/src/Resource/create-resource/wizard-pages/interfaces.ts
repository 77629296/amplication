import { FormikProps } from "formik";
import { AnalyticsEventNames } from "../../../util/analytics-events.types";

export interface ResourceSettings {
  serviceName: string;
  gitOrganizationId: string;
  gitRepositoryName: string;
  isOverrideGitRepository: boolean;
  generateAdminUI: boolean;
  generateGraphQL: boolean;
  generateRestApi: boolean;
  baseDir: string;
  structureType: "Mono" | " Poly";
  databaseType: "postgres" | "mysql" | "mongo";
  templateType: "empty" | "orderManagement";
  authType: string;
  isGenerateCompleted: string;
}
export interface NextPage {
  nextTitle: string;
  isValid: boolean;
}

export enum EnumTemplateType {
  empty = "empty",
  orderManagement = "orderManagement",
  customerRelationshipManagement = "customerRelationshipManagement",
  inventoryManagement = "inventoryManagement",
  userManagement = "userManagement",
  socialMediaManagement = "socialMediaManagement",
  eventManagement = "eventManagement",
  messagingAndChat = "messagingAndChat",
  paymentProcessing = "paymentProcessing",
}

export interface WizardStepProps {
  moduleClass: string;
  trackWizardPageEvent: (
    eventName: AnalyticsEventNames,
    additionalData?: { [key: string]: string }
  ) => void;
  formik?: FormikProps<{ [key: string]: any }>;
  goNextPage?: () => void;
}
