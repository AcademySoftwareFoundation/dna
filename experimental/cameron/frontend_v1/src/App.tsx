import {
  Flex,
  Text,
  Button,
  Card,
  Badge,
  TextArea,
  Box,
  Select,
  Tabs,
} from "@radix-ui/themes";
import { useDNAFramework } from "./hooks/useDNAFramework";
import { useShotGrid } from "./hooks/useShotGrid";
import { useState, useEffect } from "react";
import { ConnectionStatus } from "../../shared/dna-frontend-framework";
import { useGetVersions } from "./hooks/useGetVersions";

export default function App() {
  const toreviewversions = useGetVersions();
  const {
    framework,
    connectionStatus,
    setVersion,
    setUserNotes,
    setAiNotes,
    addVersions,
    getTranscriptText,
    generateNotes,
    state,
  } = useDNAFramework();
  const shotgrid = useShotGrid();
  const [meetingId, setMeetingId] = useState("");
  const [generatingNotesId, setGeneratingNotesId] = useState<string | null>(
    null,
  );
  const [uploadingCSV, setUploadingCSV] = useState(false);

  // AI LLM state
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [metaApiKey, setMetaApiKey] = useState("");
  const [openaiPrompt, setOpenaiPrompt] = useState("");
  const [claudePrompt, setClaudePrompt] = useState("");
  const [metaPrompt, setMetaPrompt] = useState("");

  // Staging notes for each version (before sending)
  const [stagingNotes, setStagingNotes] = useState<Record<string, string>>({});

  // Selected version for viewing details
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );

  // User name for collaborative notes
  const [userName, setUserName] = useState<string>("");
  const [showNamePrompt, setShowNamePrompt] = useState<boolean>(true);

  // Send staged note to the notes list
  const handleSendNote = (versionId: number) => {
    const stagedNote = stagingNotes[versionId] || "";
    if (!stagedNote.trim()) return;

    const currentUserNotes =
      versions.find((v) => Number(v.id) === versionId)?.userNotes || "";
    const separator = currentUserNotes ? "\n\n" : "";
    const formattedNote = `${userName}: ${stagedNote.trim()}`;
    setUserNotes(versionId, currentUserNotes + separator + formattedNote);

    // Clear staging area
    setStagingNotes((prev) => ({ ...prev, [versionId]: "" }));
  };

  // Update staging note for a version
  const handleStagingNoteChange = (versionId: number, text: string) => {
    setStagingNotes((prev) => ({ ...prev, [versionId]: text }));
  };

  // Populate framework with versions from useGetVersions on mount
  useEffect(() => {
    const versionData = Object.entries(toreviewversions).map(
      ([id, version]) => ({
        id: Number(id),
        context: {
          ...version,
          description: version.description || `Version ${id}`,
        },
      }),
    );
    addVersions(versionData);
  }, []);

  // Load playlist items manually with button
  const handleLoadPlaylist = async () => {
    if (!shotgrid.selectedPlaylistId) return;

    try {
      const items = await shotgrid.fetchPlaylistItems(
        shotgrid.selectedPlaylistId,
      );

      // Clear existing versions first
      framework.clearVersions();

      // Convert playlist items to versions
      const versionData = items.map((item, index) => ({
        id: Date.now() + index, // Generate unique IDs
        context: {
          description: item,
        },
      }));

      // Add new versions
      addVersions(versionData);

      alert(`Loaded ${items.length} items from playlist`);
    } catch (error) {
      console.error("Error loading playlist:", error);
      alert("Failed to load playlist items");
    }
  };

  const handleJoinMeeting = () => {
    if (meetingId.trim()) {
      framework.joinMeeting(meetingId);
    }
  };

  const handleLeaveMeeting = () => {
    framework.leaveMeeting();
  };

  const handleCSVUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingCSV(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("http://localhost:8000/upload-playlist", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();

        // Clear existing versions
        framework.clearVersions();

        // Convert CSV items to versions
        const versionData = data.items.map((item: string, index: number) => ({
          id: Date.now() + index,
          context: {
            description: item,
          },
        }));

        addVersions(versionData);
        alert(`Loaded ${data.items.length} items from CSV`);
      } else {
        const error = await response.json();
        alert(`Failed to upload CSV: ${error.detail || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error uploading CSV:", error);
      alert("Failed to upload CSV. Make sure the backend is running.");
    } finally {
      setUploadingCSV(false);
      // Reset the input so the same file can be uploaded again
      event.target.value = "";
    }
  };

  const handleCSVExport = () => {
    if (versions.length === 0) {
      alert("No versions to export");
      return;
    }

    // Escape fields that contain commas, quotes, or newlines
    const escapeCSV = (field: string) => {
      if (field.includes(",") || field.includes('"') || field.includes("\n")) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    // Create CSV content - one row per note
    const headers = ["Version", "Note", "Transcript"];
    const rows: string[] = [];

    versions.forEach((version) => {
      const versionName =
        version.context.description || `Version ${version.id}`;
      const transcript = getTranscriptText(version.id);
      const notes = version.userNotes || "";

      // Split notes by double newline to get individual notes
      const individualNotes = notes.split("\n\n").filter((note) => note.trim());

      if (individualNotes.length > 0) {
        // Create a row for each note
        individualNotes.forEach((note) => {
          rows.push(
            [
              escapeCSV(versionName),
              escapeCSV(note.trim()),
              escapeCSV(transcript),
            ].join(","),
          );
        });
      } else {
        // If no notes, create one row with empty note
        rows.push(
          [escapeCSV(versionName), "", escapeCSV(transcript)].join(","),
        );
      }
    });

    const csvContent = [headers.join(","), ...rows].join("\n");

    // Create blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `dna-notes-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return "green";
      case ConnectionStatus.CONNECTING:
        return "yellow";
      case ConnectionStatus.DISCONNECTED:
      case ConnectionStatus.CLOSED:
        return "red";
      case ConnectionStatus.ERROR:
        return "red";
      default:
        return "gray";
    }
  };

  // Get versions from the framework state
  const versions = state.versions;

  // Auto-select first version when versions change
  useEffect(() => {
    if (versions.length > 0 && !selectedVersionId) {
      setSelectedVersionId(versions[0].id);
    }
  }, [versions, selectedVersionId]);

  // Set active version for transcript streaming when selection changes
  useEffect(() => {
    if (selectedVersionId) {
      const selectedVersion = versions.find((v) => v.id === selectedVersionId);
      if (selectedVersion) {
        setVersion(Number(selectedVersionId), {
          ...selectedVersion.context,
        });
      }
    }
  }, [selectedVersionId, versions, setVersion]);

  return (
    <>
      {/* Name Prompt Modal Overlay */}
      {showNamePrompt && !userName && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <Card size="3" style={{ maxWidth: 400, width: "90%" }}>
            <Flex direction="column" gap="3" p="4">
              <Text size="5" weight="bold">
                What is your name:
              </Text>
              <input
                type="text"
                placeholder="Enter your name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const name = e.currentTarget.value.trim();
                    if (name) {
                      setUserName(name);
                      setShowNamePrompt(false);
                    }
                  }
                }}
                autoFocus
                style={{
                  padding: "10px 14px",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  fontSize: "16px",
                }}
              />
              <Button
                onClick={(e) => {
                  const input = e.currentTarget
                    .previousElementSibling as HTMLInputElement;
                  const name = input?.value.trim();
                  if (name) {
                    setUserName(name);
                    setShowNamePrompt(false);
                  }
                }}
                size="3"
              >
                Continue
              </Button>
            </Flex>
          </Card>
        </div>
      )}

      <Flex direction="column" gap="4" p="4">
        <Flex direction="row" gap="3" align="center">
          <Text size="5" weight="bold">
            Dailies Notes Assistant
          </Text>
          <Badge color={getStatusColor(connectionStatus)}>
            {connectionStatus ? connectionStatus.toUpperCase() : "Unknown"}
          </Badge>
        </Flex>

        <Flex direction="row" gap="4" wrap="wrap">
          <Card size="2" style={{ flex: 1, minWidth: 300, maxWidth: 400 }}>
            <Flex direction="column" gap="3" p="4">
              <Text size="4" weight="bold">
                Join Meeting
              </Text>
              <Flex direction="column" gap="2">
                <label htmlFor="meeting-id">Meeting ID</label>
                <input
                  id="meeting-id"
                  type="text"
                  placeholder="Enter meeting ID or URL"
                  value={meetingId}
                  onChange={(e) => setMeetingId(e.target.value)}
                  disabled={connectionStatus !== ConnectionStatus.DISCONNECTED}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontSize: "14px",
                  }}
                />
              </Flex>
              {connectionStatus !== ConnectionStatus.CONNECTED && (
                <Button
                  onClick={handleJoinMeeting}
                  disabled={
                    !meetingId.trim() ||
                    connectionStatus !== ConnectionStatus.DISCONNECTED
                  }
                  size="2"
                >
                  Join Meeting
                </Button>
              )}

              {connectionStatus === ConnectionStatus.CONNECTED && (
                <Button onClick={handleLeaveMeeting} size="2" color="red">
                  Leave Meeting
                </Button>
              )}
            </Flex>
          </Card>

          <Card size="2" style={{ flex: 1, minWidth: 300, maxWidth: 400 }}>
            <Flex direction="column" gap="3" p="4">
              <Text size="4" weight="bold">
                LLM Assistant
              </Text>
              <Tabs.Root defaultValue="openai">
                <Tabs.List>
                  <Tabs.Trigger value="openai">OpenAI</Tabs.Trigger>
                  <Tabs.Trigger value="claude">Claude</Tabs.Trigger>
                  <Tabs.Trigger value="llama">Llama</Tabs.Trigger>
                </Tabs.List>

                <Box pt="3">
                  <Tabs.Content value="openai">
                    <Flex direction="column" gap="2">
                      <label htmlFor="openai-api-key">API Key:</label>
                      <input
                        id="openai-api-key"
                        type="password"
                        placeholder="Enter OpenAI API Key"
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #ccc",
                          borderRadius: "4px",
                          fontSize: "14px",
                        }}
                      />
                      <label htmlFor="openai-prompt">Prompt:</label>
                      <TextArea
                        id="openai-prompt"
                        value={openaiPrompt}
                        onChange={(e) => setOpenaiPrompt(e.target.value)}
                        placeholder="Enter your prompt for OpenAI"
                        style={{ minHeight: 80 }}
                      />
                    </Flex>
                  </Tabs.Content>

                  <Tabs.Content value="claude">
                    <Flex direction="column" gap="2">
                      <label htmlFor="claude-api-key">API Key:</label>
                      <input
                        id="claude-api-key"
                        type="password"
                        placeholder="Enter Claude API Key"
                        value={claudeApiKey}
                        onChange={(e) => setClaudeApiKey(e.target.value)}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #ccc",
                          borderRadius: "4px",
                          fontSize: "14px",
                        }}
                      />
                      <label htmlFor="claude-prompt">Prompt:</label>
                      <TextArea
                        id="claude-prompt"
                        value={claudePrompt}
                        onChange={(e) => setClaudePrompt(e.target.value)}
                        placeholder="Enter your prompt for Claude"
                        style={{ minHeight: 80 }}
                      />
                    </Flex>
                  </Tabs.Content>

                  <Tabs.Content value="llama">
                    <Flex direction="column" gap="2">
                      <label htmlFor="llama-api-key">API Key:</label>
                      <input
                        id="llama-api-key"
                        type="password"
                        placeholder="Enter Llama API Key"
                        value={metaApiKey}
                        onChange={(e) => setMetaApiKey(e.target.value)}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #ccc",
                          borderRadius: "4px",
                          fontSize: "14px",
                        }}
                      />
                      <label htmlFor="llama-prompt">Prompt:</label>
                      <TextArea
                        id="llama-prompt"
                        value={metaPrompt}
                        onChange={(e) => setMetaPrompt(e.target.value)}
                        placeholder="Enter your prompt for Llama"
                        style={{ minHeight: 80 }}
                      />
                    </Flex>
                  </Tabs.Content>
                </Box>
              </Tabs.Root>
            </Flex>
          </Card>

          <Card size="2" style={{ flex: 1, minWidth: 300, maxWidth: 400 }}>
            <Flex direction="column" gap="3" p="4">
              <Text size="4" weight="bold">
                Playlists
              </Text>
              <Tabs.Root defaultValue="csv">
                <Tabs.List>
                  <Tabs.Trigger value="flowptr">Flow PTR Playlist</Tabs.Trigger>
                  <Tabs.Trigger value="csv">CSV Playlist</Tabs.Trigger>
                </Tabs.List>

                <Box pt="3">
                  <Tabs.Content value="flowptr">
                    {shotgrid.isEnabled ? (
                      <Flex direction="column" gap="2">
                        <label htmlFor="sg-project">Project</label>
                        <Select.Root
                          value={shotgrid.selectedProjectId ?? undefined}
                          onValueChange={shotgrid.setSelectedProjectId}
                          disabled={
                            shotgrid.loading || shotgrid.projects.length === 0
                          }
                        >
                          <Select.Trigger placeholder="Select Project" />
                          <Select.Content>
                            {shotgrid.projects.map((project) => (
                              <Select.Item
                                key={project.id}
                                value={String(project.id)}
                              >
                                {project.code}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>

                        <label htmlFor="sg-playlist">Playlist</label>
                        <Select.Root
                          value={shotgrid.selectedPlaylistId ?? undefined}
                          onValueChange={shotgrid.setSelectedPlaylistId}
                          disabled={
                            !shotgrid.selectedProjectId ||
                            shotgrid.loading ||
                            shotgrid.playlists.length === 0
                          }
                        >
                          <Select.Trigger placeholder="Select Playlist" />
                          <Select.Content>
                            {shotgrid.playlists.map((playlist) => (
                              <Select.Item
                                key={playlist.id}
                                value={String(playlist.id)}
                              >
                                {playlist.code} (
                                {playlist.created_at?.slice(0, 10)})
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>

                        <Button
                          onClick={handleLoadPlaylist}
                          disabled={
                            !shotgrid.selectedPlaylistId || shotgrid.loading
                          }
                          size="2"
                        >
                          Load Playlist
                        </Button>
                        {shotgrid.loading && (
                          <Text size="1" color="gray">
                            Loading...
                          </Text>
                        )}
                        {shotgrid.error && (
                          <Text size="1" color="red">
                            {shotgrid.error}
                          </Text>
                        )}
                      </Flex>
                    ) : (
                      <Text size="2" color="gray">
                        ShotGrid integration is not enabled
                      </Text>
                    )}
                  </Tabs.Content>

                  <Tabs.Content value="csv">
                    <Flex direction="column" gap="2">
                      <Text size="2" color="gray">
                        Upload a CSV file with version names in the first column
                        (header row will be skipped)
                      </Text>
                      <input
                        id="csv-upload"
                        type="file"
                        accept=".csv"
                        onChange={handleCSVUpload}
                        disabled={uploadingCSV}
                        style={{ display: "none" }}
                      />
                      <Button
                        onClick={() =>
                          document.getElementById("csv-upload")?.click()
                        }
                        disabled={uploadingCSV}
                        size="2"
                      >
                        {uploadingCSV ? "Uploading..." : "Import CSV"}
                      </Button>
                      <Button
                        onClick={handleCSVExport}
                        disabled={versions.length === 0}
                        size="2"
                        variant="outline"
                      >
                        Export CSV
                      </Button>
                    </Flex>
                  </Tabs.Content>
                </Box>
              </Tabs.Root>
            </Flex>
          </Card>
        </Flex>

        {versions.length > 0 && (
          <Card size="2" style={{ marginTop: 16 }}>
            <Flex
              direction="row"
              gap="4"
              p="4"
              style={{ height: 520, maxHeight: "60vh" }}
            >
              {/* Version List Sidebar */}
              <Box
                style={{
                  width: 320,
                  minWidth: 320,
                  borderRight: "1px solid #e0e0e0",
                  paddingRight: 16,
                  display: "flex",
                  flexDirection: "column",
                  maxHeight: "100%",
                }}
              >
                <Text
                  size="4"
                  weight="bold"
                  style={{ marginBottom: 12, display: "block" }}
                >
                  Versions
                </Text>
                <Flex
                  direction="column"
                  gap="2"
                  style={{
                    overflowY: "auto",
                    flex: 1,
                  }}
                >
                  {versions.map((version) => (
                    <Box
                      key={version.id}
                      style={{
                        width: "100%",
                      }}
                    >
                      <Button
                        onClick={() => setSelectedVersionId(version.id)}
                        variant={
                          selectedVersionId === version.id ? "solid" : "soft"
                        }
                        style={{
                          justifyContent: "flex-start",
                          textAlign: "left",
                          width: "100%",
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                          height: "auto",
                          minHeight: "auto",
                          padding: "10px 12px",
                          lineHeight: "1.4",
                        }}
                        size="2"
                      >
                        {version.context.description || `Version ${version.id}`}
                      </Button>
                    </Box>
                  ))}
                </Flex>
              </Box>

              {/* Version Details with Tabs */}
              {selectedVersionId &&
                (() => {
                  const selectedVersion = versions.find(
                    (v) => v.id === selectedVersionId,
                  );
                  if (!selectedVersion) return null;

                  return (
                    <Box style={{ flex: 1 }}>
                      <Flex direction="column" gap="3">
                        <Flex
                          direction="row"
                          gap="4"
                          align="start"
                          justify="between"
                        >
                          <Flex direction="column" gap="2">
                            <Text size="4" weight="bold">
                              {selectedVersion.context.description ||
                                `Version ${selectedVersion.id}`}
                            </Text>
                            <Text size="2" color="gray">
                              Version ID: {selectedVersion.id}
                            </Text>
                          </Flex>
                          <Flex direction="row" gap="2" align="center">
                            <Text size="2" weight="bold">
                              Name:
                            </Text>
                            <input
                              type="text"
                              value={userName}
                              onChange={(e) => setUserName(e.target.value)}
                              placeholder="Your name"
                              style={{
                                padding: "6px 10px",
                                border: "1px solid #404040",
                                borderRadius: "4px",
                                fontSize: "14px",
                                backgroundColor: "#1a1a1a",
                                color: "#e0e0e0",
                                width: "150px",
                              }}
                            />
                          </Flex>
                        </Flex>

                        <Tabs.Root defaultValue="notes">
                          <Tabs.List>
                            <Tabs.Trigger value="notes">
                              User Notes
                            </Tabs.Trigger>
                            <Tabs.Trigger value="transcript">
                              Transcript
                            </Tabs.Trigger>
                          </Tabs.List>

                          <Box pt="3">
                            <Tabs.Content value="notes">
                              <Flex direction="column" gap="2">
                                {/* Notes display area (chat-like) */}
                                <TextArea
                                  id={`user-notes-${selectedVersion.id}`}
                                  value={selectedVersion.userNotes || ""}
                                  placeholder="Sent notes will appear here..."
                                  readOnly
                                  style={{
                                    minHeight: 200,
                                    backgroundColor: "#1a1a1a",
                                    border: "1px solid #404040",
                                  }}
                                />

                                {/* AI Notes sliver */}
                                <Flex
                                  direction="row"
                                  gap="2"
                                  align="center"
                                  style={{
                                    padding: "10px 12px",
                                    backgroundColor: "#2a2a2a",
                                    borderRadius: "6px",
                                    border: "1px solid #404040",
                                  }}
                                >
                                  <Text
                                    size="2"
                                    style={{
                                      flex: 1,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      color: selectedVersion.aiNotes
                                        ? "#e0e0e0"
                                        : "#888",
                                    }}
                                  >
                                    {selectedVersion.aiNotes ||
                                      "No AI notes generated yet"}
                                  </Text>
                                  <Button
                                    onClick={async () => {
                                      setGeneratingNotesId(selectedVersion.id);
                                      try {
                                        // Check if any API key is provided
                                        const hasApiKey =
                                          openaiApiKey ||
                                          claudeApiKey ||
                                          metaApiKey;

                                        if (!hasApiKey) {
                                          // Show test output if no API key
                                          const testOutput =
                                            "Test Output: Please add an API Key";
                                          setAiNotes(
                                            Number(selectedVersion.id),
                                            testOutput,
                                          );
                                        } else {
                                          // Call actual generate function when API key exists
                                          const notes = await generateNotes(
                                            Number(selectedVersion.id),
                                          );
                                          setAiNotes(
                                            Number(selectedVersion.id),
                                            notes,
                                          );
                                        }
                                      } catch (error) {
                                        console.error(
                                          "Error generating notes:",
                                          error,
                                        );
                                        alert(
                                          "Failed to generate notes. Check console for details.",
                                        );
                                      } finally {
                                        setGeneratingNotesId(null);
                                      }
                                    }}
                                    disabled={
                                      generatingNotesId === selectedVersion.id
                                    }
                                    size="1"
                                    variant="soft"
                                  >
                                    {generatingNotesId === selectedVersion.id
                                      ? "..."
                                      : "↻"}
                                  </Button>
                                  <Button
                                    size="1"
                                    variant="soft"
                                    onClick={() => {
                                      const currentStaging =
                                        stagingNotes[selectedVersion.id] || "";
                                      const separator = currentStaging
                                        ? "\n\n"
                                        : "";
                                      handleStagingNoteChange(
                                        Number(selectedVersion.id),
                                        currentStaging +
                                          separator +
                                          (selectedVersion.aiNotes || ""),
                                      );
                                    }}
                                    disabled={!selectedVersion.aiNotes}
                                  >
                                    Add
                                  </Button>
                                </Flex>

                                {/* Staging area */}
                                <TextArea
                                  onFocus={() =>
                                    setVersion(Number(selectedVersion.id), {
                                      ...selectedVersion.context,
                                    })
                                  }
                                  id={`staging-notes-${selectedVersion.id}`}
                                  value={stagingNotes[selectedVersion.id] || ""}
                                  onChange={(e) =>
                                    handleStagingNoteChange(
                                      Number(selectedVersion.id),
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Type your note here..."
                                  style={{ minHeight: 80 }}
                                />

                                {/* Send button */}
                                <Button
                                  onClick={() =>
                                    handleSendNote(Number(selectedVersion.id))
                                  }
                                  disabled={
                                    !(
                                      stagingNotes[selectedVersion.id] || ""
                                    ).trim()
                                  }
                                  size="1"
                                >
                                  Send
                                </Button>
                              </Flex>
                            </Tabs.Content>

                            <Tabs.Content value="transcript">
                              <Flex direction="column" gap="2">
                                <TextArea
                                  onFocus={() =>
                                    setVersion(Number(selectedVersion.id), {
                                      ...selectedVersion.context,
                                    })
                                  }
                                  id={`transcript-${selectedVersion.id}`}
                                  value={getTranscriptText(selectedVersion.id)}
                                  placeholder="Transcript will appear here as it's received..."
                                  readOnly
                                  style={{ minHeight: 350 }}
                                />
                              </Flex>
                            </Tabs.Content>
                          </Box>
                        </Tabs.Root>
                      </Flex>
                    </Box>
                  );
                })()}
            </Flex>
          </Card>
        )}
      </Flex>
    </>
  );
}
