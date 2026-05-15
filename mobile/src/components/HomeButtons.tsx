import { View, StyleSheet } from 'react-native'
import { SM, LG } from '../tokens'
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
    paddingTop: SM,
    paddingBottom: LG,
    backgroundColor: WHITE,
  },
})
