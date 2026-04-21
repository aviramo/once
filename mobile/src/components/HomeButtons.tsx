import { View, StyleSheet } from 'react-native'
import { SINGLE, DOUBLE } from '../fonts'

export type HomeButtonsProps = {
  children: React.ReactNode
}

export function HomeButtons({ children }: HomeButtonsProps) {
  return (
    <View style={styles.wrap}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    padding: SINGLE,
    paddingTop: DOUBLE,
    paddingBottom: SINGLE,
  },
})
