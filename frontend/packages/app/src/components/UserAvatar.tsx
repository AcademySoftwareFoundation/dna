import { AlertDialog, Avatar, Button, Flex, IconButton } from '@radix-ui/themes';

interface UserAvatarProps {
  name?: string;
  imageUrl?: string;
  size?: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
  onLogout?: () => void;
}

export function UserAvatar({
  name = 'User',
  imageUrl,
  size = '2',
  onLogout,
}: UserAvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const avatar = (
    <Avatar
      src={imageUrl}
      fallback={initials}
      size={size}
      radius="full"
      variant="solid"
      color="indigo"
    />
  );

  if (!onLogout) {
    return avatar;
  }

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>
        <IconButton
          variant="ghost"
          radius="full"
          size={size}
          aria-label={`Logged in as ${name}. Click to log out.`}
          style={{ padding: 0 }}
        >
          {avatar}
        </IconButton>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="400px">
        <AlertDialog.Title>Log Out</AlertDialog.Title>
        <AlertDialog.Description size="2">
          Are you sure you want to log out? You will need to select a project
          and playlist again.
        </AlertDialog.Description>

        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button variant="solid" color="red" onClick={onLogout}>
              Log Out
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
