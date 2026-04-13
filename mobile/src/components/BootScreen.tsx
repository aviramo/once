import { useEffect, useRef } from 'react'
import { Text, Animated, Easing, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { t } from '../i18n'

// Branded loading screen — pulsing logo with the tagline below. Used during
// the initial auth check (index route) and again on the home screen while
// the profile fetch + asset preload settle, so both transitions feel like
// the same continuous boot.

function SyncWishLogo({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 50" fill="none">
      <Path
        fillRule="evenodd"
        d="M18.871 33.044L17.998 44.704C17.936 45.523 18.665 46.087 19.316 45.722C23.929 43.138 38.378 33.648 45.702 12.79C46.038 11.833 45.135 10.97 44.365 11.509C40.039 14.539 30.585 20.801 24.742 21.993C24.742 21.993 28.484 19.395 30.723 15.405C30.943 15.014 30.924 14.514 30.68 14.161L22.513 2.389C22.029 1.691 21.035 1.981 20.861 2.87L18.318 15.807L6.384 26.223C5.786 26.745 5.908 27.8 6.599 28.079L18.871 33.044Z"
        fill="#111111"
      />
      <Path
        fillRule="evenodd"
        d="M39.975 28.448C39.219 29.503 37.591 31.672 36.088 32.997C35.787 33.262 35.828 33.707 36.172 33.923L44.115 38.909C44.593 39.209 45.238 38.853 45.158 38.332C44.788 35.95 43.724 30.982 41.033 28.374C40.732 28.083 40.214 28.114 39.975 28.448Z"
        fill="#111111"
      />
    </Svg>
  )
}

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
        <SyncWishLogo size={96} />
      </Animated.View>
      <Animated.Text
        style={[styles.name, { opacity: taglineFade, transform: [{ translateY: taglineY }] }]}
      >
        SyncWish
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
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 8,
    fontSize: 16,
    color: 'rgba(0,0,0,0.55)',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
})
