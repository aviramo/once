import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import { t } from '../i18n'
import { LivoLogo } from './LivoLogo'

// Size chosen to visually match the native splash icon so the handoff from
// the OS splash screen (assets/splash-icon.png, contain-fit on #f4f4f4) to
// this component is seamless — the logo stays in place, and only the
// tagline fades in from below.
const LOGO_SIZE = 192

export function BootScreen() {
  const taglineFade = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(taglineFade, {
      toValue: 1,
      duration: 700,
      delay: 250,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
  }, [])

  const taglineY = taglineFade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] })

  return (
    <View style={styles.root}>
      <LivoLogo size={LOGO_SIZE} animate />
      <Animated.View
        style={[
          styles.taglineWrap,
          { opacity: taglineFade, transform: [{ translateY: taglineY }] },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.tagline}>{t('auth.tagline')}</Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f4f4f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Absolute positioning keeps the tagline out of the flex flow so it cannot
  // pull the logo off the screen's true vertical center.
  taglineWrap: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: LOGO_SIZE / 2 + 28,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  tagline: {
    fontSize: 18,
    color: 'rgba(0,0,0,0.5)',
    letterSpacing: 0.2,
    textAlign: 'center',
    lineHeight: 26,
  },
})
