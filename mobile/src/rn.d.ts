import 'react-native'

declare module 'react-native' {
  interface ScrollViewProps {
    delaysContentTouches?: boolean
  }
}
