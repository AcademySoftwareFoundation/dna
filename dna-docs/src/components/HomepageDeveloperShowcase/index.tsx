import type {ReactNode} from 'react';
import CodeBlock from '@theme/CodeBlock';
import Heading from '@theme/Heading';
import SectionLabel from '@site/src/components/SectionLabel';
import styles from './styles.module.css';

// Real excerpts from the backend (trimmed), in the API reference's code
// style: the publish endpoint, the production-tracking provider contract,
// and the LLM provider switch.

const ROUTE = `@app.post(
    "/playlists/{playlist_id}/publish-notes",
    tags=["Publishing"],
    summary="Publish draft notes",
    response_model=PublishNotesResponse,
)
async def publish_notes(
    playlist_id: str,
    request: PublishNotesRequest,
    storage: StorageProviderDep,
    prodtrack: ProdtrackProviderDep,
    _: CurrentUserDep,
) -> PublishNotesResponse:
    """Publish draft notes to the production tracking system."""`;

const PROVIDER = `class ProdtrackProviderBase:
    """What DNA needs from a production tracking system."""

    def get_versions_for_playlist(self, playlist_id: str) -> list["Version"]:
        raise NotImplementedError("Subclasses must implement this method.")

    def publish_note(
        self,
        version_id: str,
        content: str,
        subject: str,
        to_users: list[str],
        cc_users: list[str],
        links: list["EntityBase"],
        author_email: str | None = None,
        version_status: str | None = None,
    ) -> str:
        """Publish a note; returns the ID of the created note."""
        raise NotImplementedError("Subclasses must implement this method.")`;

const LLM = `def get_llm_provider() -> LLMProviderBase:
    """Factory function to get the configured LLM provider."""
    provider_type = os.getenv("LLM_PROVIDER", "openai").lower()

    if provider_type == "anthropic":
        from dna.llm_providers.anthropic_provider import AnthropicProvider

        return AnthropicProvider()

    if provider_type == "custom":
        from dna.llm_providers.custom_provider import CustomProvider

        return CustomProvider()`;

/**
 * Mirror of HomepageShowcase: backend code fading into the page from right
 * to left, with the copy on the left over the faded part.
 */
export default function HomepageDeveloperShowcase(): ReactNode {
  return (
    <section className={styles.showcase}>
      <div className="container">
        <SectionLabel>Built to be built on</SectionLabel>
        <div className={styles.row}>
          <div className={styles.stage} aria-hidden="true">
            <div className={styles.code}>
              <CodeBlock language="python" title="backend/src/main.py">
                {ROUTE}
              </CodeBlock>
              <CodeBlock
                language="python"
                title="backend/src/dna/prodtrack_providers/prodtrack_provider_base.py">
                {PROVIDER}
              </CodeBlock>
              <CodeBlock language="python" title="backend/src/dna/llm_providers/llm_provider_base.py">
                {LLM}
              </CodeBlock>
            </div>
            <div className={styles.fadeLeft} />
            <div className={styles.fadeBottom} />
          </div>
          <div className={styles.copy}>
            <Heading as="h2" className={styles.heading}>
              An API designed to be extended
            </Heading>
            <p>
              Everything the DNA frontend does goes through a documented REST API: the same FastAPI
              endpoints you will find in the Backend API reference, with OpenAPI schemas, typed
              models and worked examples for every call.
            </p>
            <p>
              Integrations are providers behind small base classes: production tracking, transcription,
              storage, authentication and the LLM itself. Implement a handful of methods and DNA runs
              on your pipeline, with no changes to the UI.
            </p>
            <p>
              Prompts, note QC rules, the glossary and the choice of model are configuration rather
              than code, and the Python backend is plain enough to fork, extend and setup on your own
              infrastructure.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
