import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../src/stores/authStore'

export default function Index() {
  const { user, loading } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    router.replace(user ? '/home' : '/login')
  }, [user, loading])

  return (
    <View style={{ flex: 1, backgroundColor: '#0d0005', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="rgba(255,100,60,0.7)" size="large" />
    </View>
  )
}
