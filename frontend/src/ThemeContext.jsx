import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({ isDark: false, toggleTheme: () => {} })

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem('pdf2mrk-theme') === 'dark',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    const favicon = document.getElementById('favicon')
    if (favicon) favicon.href = isDark ? '/favicon-dark.png' : '/favicon.png'
    localStorage.setItem('pdf2mrk-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme: () => setIsDark((v) => !v) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
