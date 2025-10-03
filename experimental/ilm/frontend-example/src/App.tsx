import { Flex, Text, Button, Card, Badge, TextArea, Box } from "@radix-ui/themes";
import { useDNAFramework } from "./hooks/useDNAFramework";
import { useState, useEffect } from "react";
import { ConnectionStatus } from "../../dna-frontend-framework";
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
		state } = useDNAFramework();
	const [meetingId, setMeetingId] = useState("");
	const [generatingNotesId, setGeneratingNotesId] = useState<string | null>(null);
	// Populate framework with versions from useGetVersions on mount
	useEffect(() => {
		const versionData = Object.entries(toreviewversions).map(([id, version]) => ({
			id: Number(id),
			context: {
				...version,
				description: version.description || `Version ${id}`
			}
		}));
		addVersions(versionData);
	}, []);

	const handleJoinMeeting = () => {
		if (meetingId.trim()) {
			framework.joinMeeting(meetingId);
		}
	};

	const handleLeaveMeeting = () => {
		framework.leaveMeeting();
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
	return (
		<Flex direction="column" gap="4" p="4">
			<Flex direction="row" gap="3" align="center">
				<Text size="5" weight="bold">DNA Example Application</Text>
				<Badge color={getStatusColor(connectionStatus)}>
					{connectionStatus ? connectionStatus.toUpperCase() : "Unknown"}
				</Badge>
			</Flex>
			
			<Card size="2" style={{ maxWidth: 400 }}>
				<Flex direction="column" gap="3" p="4">
					<Text size="4" weight="bold">Join Meeting</Text>
					<Flex direction="column" gap="2">
						<label htmlFor="meeting-id">Meeting ID</label>
						<input
							id="meeting-id"
							type="text"
							placeholder="Enter meeting ID"
							value={meetingId}
							onChange={(e) => setMeetingId(e.target.value)}
							disabled={connectionStatus !== ConnectionStatus.DISCONNECTED}
							style={{
								padding: '8px 12px',
								border: '1px solid #ccc',
								borderRadius: '4px',
								fontSize: '14px'
							}}
						/>
					</Flex>
					{connectionStatus !== ConnectionStatus.CONNECTED && (
					<Button 
						onClick={handleJoinMeeting}
						disabled={!meetingId.trim() || connectionStatus !== ConnectionStatus.DISCONNECTED}
						size="2"
					>
						Join Meeting
					</Button>
					)}

					{connectionStatus === ConnectionStatus.CONNECTED && (
						<Button 
							onClick={handleLeaveMeeting}
							size="2"
						>
							Leave Meeting
						</Button>
					)}
				</Flex>
			</Card>

		{versions.map((version) => (
			<Card key={version.id} size="2" style={{ marginTop: 16 }}>
				<Flex direction="row" gap="4" p="4">
					<Flex direction="column" gap="2">
						<Text size="3" weight="bold">Version ID: {version.id}</Text>
						<Text size="2">
							{version.context.description ? version.context.description : <em>No description</em>}
						</Text>
						<Button
							onClick={async () =>  {
								setGeneratingNotesId(version.id);
								try {
									const notes = await generateNotes(Number(version.id));
									setAiNotes(Number(version.id), notes);
								} catch (error) {
									console.error('Error generating notes:', error);
								} finally {
									setGeneratingNotesId(null);
								}
							}}
							disabled={generatingNotesId === version.id}
						>
							{generatingNotesId === version.id ? "Generating..." : "Generate AI Notes"}
						</Button>
					</Flex>
					<Box mt="2">
						<label htmlFor={`user-notes-${version.id}`}>User Notes</label>
						<TextArea
							onFocus={() => setVersion(Number(version.id), { ...version.context  })}
							id={`user-notes-${version.id}`}
							value={version.userNotes || ''}
							onChange={e => setUserNotes(Number(version.id), e.target.value)}
							placeholder="Enter your notes for this version"
							style={{ minWidth: 250, minHeight: 200, marginTop: 4 }}
						/>
					</Box>
					<Box mt="2">
						<label htmlFor={`ai-notes-${version.id}`}>AI Generated Notes</label>
						<TextArea
							id={`ai-notes-${version.id}`}
							value={version.aiNotes || ''}
							placeholder="AI generated notes will appear here..."
							readOnly
							style={{ minWidth: 250, minHeight: 200, marginTop: 4 }}						/>
					</Box>
					<Box mt="2">
						<label htmlFor={`transcript-${version.id}`}>Transcript</label>
						<TextArea
							id={`transcript-${version.id}`}
							value={getTranscriptText(version.id)}
							placeholder="Transcript will appear here as it's received..."
							readOnly
							style={{ minWidth: 500, minHeight: 200, marginTop: 4 }}
						/>
					</Box>
						
				</Flex>
			</Card>
		))}

			
		</Flex>
	);
}