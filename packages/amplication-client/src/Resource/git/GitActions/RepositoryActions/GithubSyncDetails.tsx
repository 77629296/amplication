import { Snackbar } from "@amplication/ui/design-system";
import { useMutation } from "@apollo/client";
import classNames from "classnames";
import { AnalyticsEventNames } from "../../../../util/analytics-events.types";
import { useCallback } from "react";
import { Button, EnumButtonStyle } from "../../../../Components/Button";
import { Resource } from "../../../../models";
import { formatError } from "../../../../util/error";
import { DISCONNECT_GIT_REPOSITORY } from "../../../../Workspaces/queries/resourcesQueries";
import GitRepoDetails from "../../GitRepoDetails";
import "./GithubSyncDetails.scss";
import { ENTER } from "../../../../util/hotkeys";

const CLASS_NAME = "github-repo-details";

type Props = {
  resourceWithRepository: Resource;
  className?: string;
  showGitRepositoryBtn?: boolean;
};

function GithubSyncDetails({
  resourceWithRepository,
  className,
  showGitRepositoryBtn = true,
}: Props) {
  const [disconnectGitRepository, { error: disconnectErrorUpdate }] =
    useMutation(DISCONNECT_GIT_REPOSITORY, {
      variables: { resourceId: resourceWithRepository.id },
    });

  const handleDisconnectGitRepository = useCallback(() => {
    disconnectGitRepository({
      variables: { resourceId: resourceWithRepository.id },
    }).catch(console.error);
  }, [disconnectGitRepository, resourceWithRepository.id]);
  const errorMessage = formatError(disconnectErrorUpdate);
  const gitRepositoryFullName = `${resourceWithRepository.gitRepository?.gitOrganization.name}/${resourceWithRepository.gitRepository?.name}`;
  const gitRepositoryUrl = `https://github.com/${gitRepositoryFullName}`;

  const handleKeyDownUrl = useCallback(
    (keyEvent: React.KeyboardEvent<HTMLDivElement>) => {
      if (keyEvent.key === ENTER) {
        window.open(gitRepositoryUrl);
      }
    },
    [gitRepositoryUrl]
  );

  return (
    <div className={CLASS_NAME}>
      <div className={`${CLASS_NAME}__body`}>
        <div className={`${CLASS_NAME}__details`}>
          <GitRepoDetails
            gitRepositoryFullName={gitRepositoryFullName}
            className={classNames(className, `${CLASS_NAME}__name`)}
          />
          <div tabIndex={0} onKeyDown={handleKeyDownUrl}>
            <a
              tabIndex={-1}
              href={gitRepositoryUrl}
              target="github_repo"
              className={className}
            >
              {gitRepositoryUrl}
            </a>
          </div>
        </div>

        {showGitRepositoryBtn && (
          <div className={`${CLASS_NAME}__action`}>
            <Button
              buttonStyle={EnumButtonStyle.Primary}
              eventData={{
                eventName: AnalyticsEventNames.GithubRepositoryChange,
              }}
              onClick={handleDisconnectGitRepository}
            >
              Change Repository
            </Button>
          </div>
        )}
      </div>

      <Snackbar open={Boolean(disconnectErrorUpdate)} message={errorMessage} />
    </div>
  );
}

export default GithubSyncDetails;
