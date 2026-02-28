// Safe stub functions
export async function sendMessage(message: string) {
  return { text: `Mock response: ${message}` }
}