import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet } from 'react-native'
import { Text } from './AppText'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../i18n'
import { LivoLogo } from './LivoLogo'
import { TEXT } from '../colors'

export function BootScreen() {
  // Soft pulse on the logo — opacity + scale looped while we're waiting.
  const pulse = useRef(new Animated.Value(0)).current
  // Tagline fades in once on mount so it doesn't flash with the logo.
  const taglineFade = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    )
    loop.start()
    Animated.timing(taglineFade, {
      toValue: 1,
      duration: 700,
      delay: 250,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
    return () => loop.stop()
  }, [])

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] })
  const scale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] })
  const taglineY = taglineFade.interpolate({ inputRange: [0, 1], outputRange: [6, 0] })

  // Logo sits at the true vertical center of the screen via flex centering.
  // The tagline is pulled out of the flex flow (position: absolute) so it
  // doesn't pull the logo upward off-center — it's pinned just below the
  // midline with a top offset equal to half the logo plus a small gap.
  return (
    <SafeAreaView style={styles.root}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <LivoLogo size={160} />
      </Animated.View>
      <Animated.Text
        style={[styles.name, { opacity: taglineFade, transform: [{ translateY: taglineY }] }]}
      >
        Livo
      </Animated.Text>
      <Animated.Text
        style={[styles.tagline, { opacity: taglineFade, transform: [{ translateY: taglineY }] }]}
      >
        {t('auth.tagline')}
      </Animated.Text>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f4f4f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 24,
    fontSize: 28,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 10,
    fontSize: 18,
    color: 'rgba(0,0,0,0.5)',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
})
