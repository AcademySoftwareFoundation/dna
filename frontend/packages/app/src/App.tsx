import { useQuery } from '@tanstack/react-query';
import { Box, Heading, Text, Card } from '@radix-ui/themes';
import { formatDate, isValidUrl } from '@dna/core';

function App() {
  const { data, isLoading } = useQuery({
    queryKey: ['example'],
    queryFn: async () => {
      // Example API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { message: 'Hello from DNA App!' };
    },
  });

  return (
    <Box p="6">
      <Heading size="8" mb="4">
        DNA Application
      </Heading>

      <Box mb="4">
        <Card>
          <Box p="4">
            <Text size="3">{isLoading ? 'Loading...' : data?.message}</Text>
          </Box>
        </Card>
      </Box>

      <Card>
        <Box p="4">
          <Heading size="4" mb="2">
            Core Package Demo
          </Heading>
          <Text size="2" color="gray">
            Date formatter: {formatDate(new Date().toISOString())}
          </Text>
          <Text
            size="2"
            color="gray"
            style={{ display: 'block', marginTop: '8px' }}
          >
            URL validator:{' '}
            {isValidUrl('https://example.com') ? 'Valid' : 'Invalid'}
          </Text>
        </Box>
      </Card>
    </Box>
  );
}

export default App;
