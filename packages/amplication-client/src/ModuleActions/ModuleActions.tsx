import {
  EnumApiOperationTagStyle,
  EnumContentAlign,
  EnumFlexDirection,
  EnumFlexItemMargin,
  EnumItemsAlign,
  FlexItem,
  SearchField,
  TabContentTitle,
  Toggle,
} from "@amplication/ui/design-system";
import React, { useCallback, useEffect, useState } from "react";

import { match } from "react-router-dom";
import { AppRouteProps } from "../routes/routesUtil";
import ModuleActionList from "./ModuleActionList";
import NewModuleAction from "./NewModuleAction";
import useModule from "../Modules/hooks/useModule";
import * as models from "../models";
import { useQuery } from "@apollo/client";
import { GET_RESOURCE_SETTINGS } from "../Resource/resourceSettings/GenerationSettingsForm";

const DATE_CREATED_FIELD = "createdAt";

type Props = AppRouteProps & {
  match: match<{
    resource: string;
    module?: string;
  }>;
};
const ModuleActions = React.memo(({ match, innerRoutes }: Props) => {
  const { module: moduleId, resource: resourceId } = match.params;
  const [searchPhrase, setSearchPhrase] = useState<string>("");
  const [error, setError] = useState<Error>();

  const [displayMode, setDisplayMode] = useState<EnumApiOperationTagStyle>(
    EnumApiOperationTagStyle.REST
  );

  const { data, error: serviceSettingsError } = useQuery<{
    serviceSettings: models.ServiceSettings;
  }>(GET_RESOURCE_SETTINGS, {
    variables: {
      id: resourceId,
    },
  });

  useEffect(() => {
    if (!data) return;
    if (data.serviceSettings.serverSettings.generateRestApi) {
      setDisplayMode(EnumApiOperationTagStyle.REST);
      return;
    }

    if (data.serviceSettings.serverSettings.generateGraphQL) {
      setDisplayMode(EnumApiOperationTagStyle.GQL);
    }
  }, [setDisplayMode, data]);

  const handleSearchChange = useCallback(
    (value) => {
      setSearchPhrase(value);
    },
    [setSearchPhrase]
  );

  const handleDisplayModeChange = useCallback(
    (checked: boolean) => {
      const value = checked
        ? EnumApiOperationTagStyle.REST
        : EnumApiOperationTagStyle.GQL;

      setDisplayMode(value);
    },
    [displayMode]
  );

  const { findModules, findModulesData: moduleListData } = useModule();
  const generateGraphQlAndRestApi =
    data?.serviceSettings?.serverSettings?.generateRestApi &&
    data?.serviceSettings?.serverSettings?.generateGraphQL;

  useEffect(() => {
    if (!moduleId) {
      findModules({
        variables: {
          where: {
            resource: { id: resourceId },
          },
          orderBy: {
            [DATE_CREATED_FIELD]: models.SortOrder.Asc,
          },
        },
      });
    }
  }, [resourceId, findModules, moduleId]);

  return (
    <>
      {match.isExact ? (
        <>
          <SearchField
            label="search"
            placeholder="Search"
            onChange={handleSearchChange}
          />
          <FlexItem
            itemsAlign={EnumItemsAlign.Center}
            margin={EnumFlexItemMargin.Top}
            start={
              <TabContentTitle
                title="Module Actions"
                subTitle="Actions are used to perform operations on resources, with or without API endpoints."
              />
            }
            end={
              <NewModuleAction resourceId={resourceId} moduleId={moduleId} />
            }
          ></FlexItem>

          {generateGraphQlAndRestApi && (
            <FlexItem
              direction={EnumFlexDirection.Row}
              contentAlign={EnumContentAlign.Center}
              itemsAlign={EnumItemsAlign.Center}
            >
              GraphQL API
              <Toggle
                checked={displayMode === EnumApiOperationTagStyle.REST}
                onValueChange={handleDisplayModeChange}
              />
              REST API
            </FlexItem>
          )}

          {moduleId ? (
            <FlexItem margin={EnumFlexItemMargin.Top}>
              <ModuleActionList
                moduleId={moduleId}
                resourceId={resourceId}
                searchPhrase={searchPhrase}
                displayMode={displayMode}
              />
            </FlexItem>
          ) : (
            moduleListData?.Modules.map((module) => (
              <FlexItem key={module.id} margin={EnumFlexItemMargin.Top}>
                <ModuleActionList
                  moduleId={module.id}
                  resourceId={resourceId}
                  searchPhrase={searchPhrase}
                  displayMode={displayMode}
                />
              </FlexItem>
            ))
          )}
        </>
      ) : (
        innerRoutes
      )}
    </>
  );
});

export default ModuleActions;
