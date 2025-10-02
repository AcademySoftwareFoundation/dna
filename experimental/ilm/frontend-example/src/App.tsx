import { Flex, Text, Button, Card, Badge, TextArea, Box } from "@radix-ui/themes";
import { useDNAFramework } from "./hooks/useDNAFramework";
import { useState } from "react";
import { ConnectionStatus } from "../../dna-frontend-framework";
import { useGetVersions } from "./hooks/useGetVersions";

export default function App() {
	const { framework, connectionStatus, setVersion, getTranscriptText, generateNotes } = useDNAFramework();
	const [meetingId, setMeetingId] = useState("");
	const [notesState, setNotesState] = useState<Record<string, string>>({});

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


	const versions = useGetVersions();
	
	return (
		<Flex direction="column" gap="4" p="4">
			<Flex direction="row" gap="3" align="center">
				<Text size="5" weight="bold">DNA Example Application</Text>
				<Badge color={getStatusColor(connectionStatus)}>
					{connectionStatus.toUpperCase()}
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

		{Object.entries(versions).map(([id, version]) => (
			<Card key={id} size="2" style={{ maxWidth: 400, marginTop: 16 }}>
				<Flex direction="column" gap="2" p="4">
					<Text size="3" weight="bold">Version ID: {id}</Text>
					<Text size="2">
						{version.description ? version.description : <em>No description</em>}
					</Text>
					<Box mt="2">
						<label htmlFor={`notes-${id}`}>Notes</label>
						<TextArea
							onFocus={() => setVersion(Number(id), { ...version  })}
							id={`notes-${id}`}
							value={notesState[id] || ''}
							onChange={e => setNotesState(prev => ({ ...prev, [id]: e.target.value }))}
							placeholder="Enter notes for this version"
							style={{ width: '100%', minHeight: 60, marginTop: 4 }}
						/>
					</Box>
					<Box mt="2">
						<label htmlFor={`transcript-${id}`}>Transcript</label>
						<TextArea
							id={`transcript-${id}`}
							value={getTranscriptText(id)}
							placeholder="Transcript will appear here as it's received..."
							readOnly
							style={{ width: '100%', minHeight: 60, marginTop: 4 }}
						/>
					</Box>
					<Button onClick={async () =>  {
						const notes = await generateNotes(Number(id));
						console.log(notes);
						}}>Generate Notes</Button>
				</Flex>
			</Card>
		))}

			
		</Flex>
	);
}