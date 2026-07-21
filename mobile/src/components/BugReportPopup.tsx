import { useCallback, useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { Text, TextInput } from './AppText'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { CameraIcon, CloseBoldIcon } from './icons'
import { invoke } from '../lib/api'
import { supabase } from '../lib/supabase'
import { tap } from '../lib/haptics'
import { useUserStore } from '../stores/userStore'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { t } from '../i18n'
import { SURFACE, GREEN, INK, PHOTO_CHROME, BLACK, BLACK_MID, BLACK_SOFT, BLACK_STRONG, WHITE, WHITE_SOFT, PRIMARY } from '../colors'
import { STROKE, ICON, LG, MD, RADIUS, RADII, SM, TEXT, WEIGHT, XS } from '../tokens'

// Bottom-sheet for reporting a bug: free text + one optional image. On submit
// the image (if any) is uploaded to the private `bug-attachments` bucket, then
// /app/bug_report records the row (surfaced in the web admin). Reached from the
// settings menu "report a bug" row. Self-dismisses after a successful send.

const BUG_BUCKET = 'bug-attachments'

export function BugReportPopup({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const userId = useUserStore(s => s.profile?.user_id ?? '')
  const kbHeight = useKeyboardHeight()

  const [text, setText] = useState('')
  const [localUri, setLocalUri] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset every time the sheet opens so a prior submission doesn't linger.
  useEffect(() => {
    if (!visible) return
    setText('')
    setLocalUri(null)
    setPicking(false)
    setSubmitting(false)
    setDone(false)
    setError(null)
  }, [visible])

  const onPickImage = useCallback(async () => {
    if (picking || submitting) return
    tap()
    setPicking(true)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
    }).finally(() => setPicking(false))
    if (result.canceled || !result.assets?.[0]) return
    // Resize to max 1200px, JPEG 0.75 — same as chat images.
    const manip = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
    )
    setLocalUri(manip.uri)
  }, [picking, submitting])

  const onSubmit = useCallback(async () => {
    const body = text.trim()
    if (!body || submitting) return
    tap()
    setSubmitting(true)
    setError(null)
    try {
      let attachment_key: string | undefined
      if (localUri) {
        const key = `${userId}/${Date.now()}.jpg`
        const resp = await fetch(localUri)
        const arrayBuffer = await resp.arrayBuffer()
        const { error: uploadError } = await supabase.storage
          .from(BUG_BUCKET)
          .upload(key, arrayBuffer, { contentType: 'image/jpeg', upsert: false })
        if (uploadError) throw uploadError
        attachment_key = key
      }
      await invoke('app/bug_report', { text: body, ...(attachment_key ? { attachment_key } : {}) })
      setDone(true)
    } catch {
      setError(t('bugReport.error'))
    } finally {
      setSubmitting(false)
    }
  }, [text, localUri, userId, submitting])

  return (
    <BottomSheet
      visible={visible}
      onDismiss={() => { if (!submitting) onDismiss() }}
      swipeToDismiss={!submitting}
      disableBackdropDismiss={submitting}
      cardWrapStyle={kbHeight > 0 ? { marginBottom: kbHeight } : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{t('bugReport.title')}</Text>
        {done ? (
          <Text style={styles.thanks}>{t('bugReport.thanks')}</Text>
        ) : (
          <>
            <Text style={styles.desc}>{t('bugReport.desc')}</Text>

            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={t('bugReport.placeholder')}
                placeholderTextColor={BLACK_MID}
                multiline
                editable={!submitting}
                textAlignVertical="top"
              />
            </View>

            {localUri ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: localUri }} style={styles.preview} />
                <Pressable
                  onPress={() => { if (!submitting) setLocalUri(null) }}
                  style={styles.previewRemove}
                  hitSlop={8}
                >
                  <CloseBoldIcon color={WHITE} size={ICON.md} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={onPickImage}
                disabled={picking || submitting}
                style={({ pressed }) => [styles.attach, pressed && styles.attachPressed]}
              >
                <CameraIcon color={GREEN} size={ICON.lg} />
                <Text style={styles.attachLabel}>{t('bugReport.attach')}</Text>
              </Pressable>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.submitWrap}>
              <Button
                label={t('bugReport.submit')}
                onPress={onSubmit}
                disabled={!text.trim() || submitting}
                loading={submitting}
                variant="primary"
                size="lg"
              />
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  card: {
    // No top padding: the sheet's drag handle already supplies the gap above
    // the title (its own marginBottom). Adding padding here stacked on top of
    // it and left a large dead band under the handle.
    padding: LG,
    paddingTop: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.extrabold,
    color: BLACK,
    textAlign: 'center',
  },
  desc: {
    fontSize: TEXT.md,
    color: BLACK_MID,
    marginTop: XS,
    marginBottom: LG,
    textAlign: 'center',
  },
  thanks: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.semibold,
    color: BLACK,
    marginTop: MD,
    marginBottom: SM,
    textAlign: 'center',
  },
  inputWrap: {
    alignSelf: 'stretch',
    backgroundColor: SURFACE,
    borderWidth: STROKE.thin,
    borderColor: GREEN,
    borderRadius: RADIUS,
    paddingHorizontal: MD,
    paddingVertical: SM,
    minHeight: 120,
  },
  input: {
    fontSize: TEXT.md,
    color: BLACK,
    minHeight: 100,
    padding: 0,
  },
  attach: {
    alignSelf: 'stretch',
    marginTop: MD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SM,
    paddingVertical: MD,
    borderRadius: RADIUS,
    backgroundColor: 'transparent',
    borderWidth: STROKE.thin,
    borderColor: GREEN,
  },
  attachPressed: { opacity: 0.6 },
  attachLabel: { fontSize: TEXT.md, fontWeight: WEIGHT.semibold, color: GREEN },
  previewWrap: {
    alignSelf: 'stretch',
    marginTop: MD,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  preview: { width: '100%', height: 180, borderRadius: RADIUS, backgroundColor: BLACK_SOFT },
  previewRemove: {
    position: 'absolute',
    top: SM,
    end: SM,
    width: 32,
    height: 32,
    borderRadius: RADII.pill,
    backgroundColor: PHOTO_CHROME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { marginTop: SM, fontSize: TEXT.sm, color: INK, textAlign: 'center' },
  submitWrap: { alignSelf: 'stretch', marginTop: LG },
})
