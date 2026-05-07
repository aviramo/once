import { View, StyleSheet } from 'react-native'
import { SINGLE, DOUBLE } from '../fonts'
import { WHITE } from '../colors'

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
    paddingTop: SINGLE,
    paddingBottom: 24,
    backgroundColor: WHITE,
  },
})
