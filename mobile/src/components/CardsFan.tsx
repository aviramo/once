import { useState, useEffect, useRef } from 'react'
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native'
import { t } from '../i18n'

const CARDS = [
  { emoji: '👥', labelKey: 'landing.card1' as const, descKey: 'landing.feat1.desc' as const, bg: '#FFCECE', iconColor: '#c53030' },
  { emoji: '🤝', labelKey: 'landing.card2' as const, descKey: 'landing.feat2.desc' as const, bg: '#FFF0A0', iconColor: '#b45309' },
  { emoji: '⏱',  labelKey: 'landing.card3' as const, descKey: 'landing.feat3.desc' as const, bg: '#C8F5E4', iconColor: '#15803d' },
]

export default function CardsFan() {
  const [activeCard, setActiveCard] = useState(0)
  const [zIndices, setZIndices] = useState([1, 2, 3])
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const translateYAnims = useRef(CARDS.map(() => new Animated.Value(0))).current

  const selectCard = (idx: number) => {
    setActiveCard(idx)
    setZIndices(prev => {
      const maxZ = Math.max(...prev)
      return prev.map((z, i) => i === idx ? maxZ + 1 : z)
    })
    CARDS.forEach((_, i) => {
      Animated.spring(translateYAnims[i], {
        toValue: i === idx ? -8 : 0,
        useNativeDriver: true,
        friction: 8,
      }).start()
    })
  }

  useEffect(() => {
    autoRef.current = setInterval(() => {
      setActiveCard(prev => {
        const next = (prev + 1) % 3
        selectCard(next)
        return next
      })
    }, 5000)
    return () => { if (autoRef.current) clearInterval(autoRef.current) }
  }, [])

  return (
    <View style={styles.container}>
      <View style={styles.cardsRow}>
        {CARDS.map((card, idx) => (
          <Animated.View
            key={idx}
            style={[
              styles.card,
              { backgroundColor: card.bg, zIndex: zIndices[idx], transform: [{ translateY: translateYAnims[idx] }] },
            ]}
          >
            <Pressable style={styles.cardInner} onPress={() => {
              if (idx === activeCard) return
              selectCard(idx)
              if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null }
            }}>
              <Text style={styles.cardEmoji}>{card.emoji}</Text>
              <Text style={[styles.cardLabel, { color: card.iconColor }]}>
                {t(card.labelKey)}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </View>

      <Text key={activeCard} style={styles.desc}>
        {t(CARDS[activeCard].descKey).replace(/\n/g, ' ')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    gap: 20,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    justifyContent: 'center',
  },
  card: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  cardInner: {
    padding: 16,
    alignItems: 'center',
    gap: 10,
    minHeight: 110,
    justifyContent: 'center',
  },
  cardEmoji: {
    fontSize: 32,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
  desc: {
    fontSize: 15,
    color: 'rgba(0,0,0,0.55)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
})
