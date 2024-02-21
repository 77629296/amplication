import React, { useEffect } from "react";
import * as models from "../../models";
import { useHistory } from "react-router-dom";
import useUserActionWatchStatus from "../../UserAction/useUserActionWatchStatus";
import { useMutation } from "@apollo/client";
import { CREATE_ENTITIES_FROM_PREDEFINED_SCHEMA } from "../../Entity/ImportPrismaSchema/queries";
import { MonolithOption, monolithOptions } from "./monolith-options";
import {
  Button,
  EnumContentAlign,
  EnumFlexDirection,
  EnumItemsAlign,
  EnumTextAlign,
  EnumTextColor,
  EnumTextStyle,
  FlexItem,
  Panel,
  Text,
} from "@amplication/ui/design-system";
import { BtmLoader } from "./BtmLoader";

import "./CreateEntitiesFormPredefinedSchema.scss";
const CLASS_NAME = "break-the-monolith-options";

const LOADER_TITLE =
  "We are preparing the monolith environment with the selected schema for you.";

type Props = {
  workspaceId: string;
  projectId: string;
  resourceId: string;
};

type TData = {
  createEntitiesFromPredefinedSchema: models.UserAction;
};

export const CreateEntitiesFormPredefinedSchema: React.FC<Props> = ({
  workspaceId,
  projectId,
  resourceId,
}) => {
  const history = useHistory();
  const [userAction, setUserAction] = React.useState<models.UserAction>(null);
  const { data: userActionData } = useUserActionWatchStatus(userAction);

  const [createEntitiesFormPredefinedSchema] = useMutation<TData>(
    CREATE_ENTITIES_FROM_PREDEFINED_SCHEMA,
    {
      onCompleted: (data) => {
        setUserAction(data.createEntitiesFromPredefinedSchema);
      },
    }
  );

  useEffect(() => {
    if (!userActionData || !userActionData.userAction) return;
    if (
      userActionData.userAction.status === models.EnumUserActionStatus.Completed
    ) {
      history.push(
        `/${workspaceId}/${projectId}/${resourceId}/break-the-monolith-preview`
      );
    }
  }, [userActionData, history, workspaceId, projectId, resourceId]);

  const handleBreakClicked = (selectedMonolithToBreak: MonolithOption) => {
    createEntitiesFormPredefinedSchema({
      variables: {
        data: {
          schemaName: selectedMonolithToBreak.name,
          resource: {
            connect: {
              id: resourceId,
            },
          },
        },
      },
    }).catch(console.error);
  };

  return (
    <FlexItem
      className={CLASS_NAME}
      direction={EnumFlexDirection.Column}
      itemsAlign={EnumItemsAlign.Center}
      contentAlign={EnumContentAlign.Center}
    >
      {userActionData?.userAction ? (
        <div className={`${CLASS_NAME}__loader`}>
          <BtmLoader title={LOADER_TITLE} />
        </div>
      ) : (
        <>
          <Text textStyle={EnumTextStyle.H2}>
            Break the Monolith with Amplication: A Journey of Transformation!
            <span role="img" aria-label="rocket">
              {" "}
              🚀✨
            </span>
          </Text>
          <Text
            className={`${CLASS_NAME}__description`}
            textStyle={EnumTextStyle.Normal}
            textColor={EnumTextColor.Black20}
            // textAlign={EnumTextAlign.Center}
          >
            <div>
              Dive into a transformable journey by selecting an open-source
              monolith, defined by its database schema. With Amplication, this
              is where innovation begins. We import the monolith’s schema and
              meticulously dissect it, preparing for a groundbreaking
              transformation.
            </div>
            <div>
              Witness the magic as Amplication proposes a new, streamlined
              architecture of microservices, designed for scalability and
              efficiency. You're not just observing; you’re part of the process,
              reviewing the suggested microservices architecture, understanding
              its dynamics, and visualizing the future.
            </div>
            <div>
              Embrace this collaborative adventure with Amplication, where
              breaking the monolith opens a world of possibilities and showcases
              the true potential of technological innovation.
            </div>
          </Text>
          <div className={`${CLASS_NAME}__monolith_options`}>
            {monolithOptions.map((option, index) => (
              <Panel key={index}>
                <FlexItem direction={EnumFlexDirection.Column}>
                  <FlexItem>
                    <Text textStyle={EnumTextStyle.H3}>
                      {option.displayName}
                    </Text>
                    <Button
                      onClick={() => handleBreakClicked(option)}
                      className={`${CLASS_NAME}__action-button`}
                    >
                      Break
                    </Button>
                  </FlexItem>
                  <Text
                    textStyle={EnumTextStyle.Description}
                    textColor={EnumTextColor.Black20}
                  >
                    {option.description}
                  </Text>
                  <Text textStyle={EnumTextStyle.Label}>
                    <a
                      className={`${CLASS_NAME}__link`}
                      href={option.linkToRepository}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Go to the Github repository
                    </a>
                  </Text>
                </FlexItem>
              </Panel>
            ))}
          </div>
        </>
      )}
    </FlexItem>
  );
};
