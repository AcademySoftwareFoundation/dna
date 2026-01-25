import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  * {
    box-sizing: border-box;
  }

  :root {
    font-family: ${({ theme }) => theme.fonts.sans};
    line-height: 1.5;
    font-weight: 400;
    color-scheme: dark;
    color: ${({ theme }) => theme.colors.text.primary};
    background-color: ${({ theme }) => theme.colors.bg.base};
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  html, body, #root {
    min-height: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    background: ${({ theme }) => theme.colors.bg.base};
  }

  #root > * {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    min-height: 100vh;
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.border.default};
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: ${({ theme }) => theme.colors.border.strong};
  }
`;
