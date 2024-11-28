import { ClerkProvider } from '@clerk/nextjs';
import '../app/components/global.css'; // Corrected import path
import { useMemo } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createTheme } from '@mui/material/styles';

function MyApp({ Component, pageProps }) {
  const theme = useMemo(() => createTheme(), []); // Default theme, you can customize it

  return (
    <ClerkProvider {...pageProps}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Component {...pageProps} />
      </ThemeProvider>
    </ClerkProvider>
  );
}

export default MyApp;
