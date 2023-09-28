import {
  EnumFlexItemMargin,
  EnumItemsAlign,
  EnumTextStyle,
  EnumTextWeight,
  FlexItem,
  ListItem,
  Text,
  EnumGapSize,
} from "@amplication/ui/design-system";
import { useCallback, useContext } from "react";
import { Link, useHistory } from "react-router-dom";
import ResourceCircleBadge from "../Components/ResourceCircleBadge";
import { AppContext } from "../context/appContext";
import { EnumResourceType, Project } from "../models";

type Props = {
  project: Project;
  workspaceId: string;
};

export const ProjectListItem = ({ project, workspaceId }: Props) => {
  const history = useHistory();
  const { currentWorkspace } = useContext(AppContext);

  const handleClick = useCallback(() => {
    history.push(`/${currentWorkspace?.id}/${project.id}`);
  }, [history, currentWorkspace]);

  return (
    <ListItem showDefaultActionIcon={true} onClick={handleClick}>
      <Link to={`/${workspaceId}/${project.id}`}>
        <Text
          textStyle={EnumTextStyle.Normal}
          textWeight={EnumTextWeight.SemiBold}
        >
          {project.name}
        </Text>
      </Link>

      <Text textStyle={EnumTextStyle.Description}>{project.description}</Text>
    </ListItem>
  );
};
