import { View, StyleSheet } from 'react-native'
import { SINGLE } from '../tokens'
import { WHITE } from '../colors'

type HomeButtonsProps = {
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
