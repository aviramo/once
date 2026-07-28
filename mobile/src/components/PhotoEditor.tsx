import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import { View, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import type { Image as ImageData } from '../stores/userStore'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Path, Line, Circle } from 'react-native-svg'
import * as ImagePicker from 'expo-image-picker'
import type { ImagePickerAsset } from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'
import { encode as encodeBlurhash } from 'blurhash'
// @ts-expect-error upng-js ships no type definitions
import UPNG from 'upng-js'
import { supabase } from '../lib/supabase'
import { invoke } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useUserStore } from '../stores/userStore'
import { tap, tapMedium, tapSuccess } from '../lib/haptics'
import { t } from '../i18n'
import { SM, RADIUS, STROKE, ICON } from '../tokens'
import { INK, INK_HINT, INK_DIM, PHOTO_CHROME, SURFACE, WHITE_MID, SHADOW_BLACK } from '../colors'
import { FIELD_SKIN } from '../field'
import { ConfirmDialog } from './ConfirmDialog'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!

// How many photos a profile may hold, and how many onboarding requires. The
// grid, the picker limit and the onboarding CTA gate all read these — the
// numbers were previously inlined at each of those sites.
export const MAX_PHOTOS = 6
export const MIN_PHOTOS = 2

function uuidv4(): string {
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Module-level cache of local URIs for photos whose upload is still in
// flight. Keyed by the normal-variant filename that is already committed to
// the user store. Components outside the editor (e.g. the thumbnail strip
// on the profile tab) read from this map so they can show the image from
// the device cache while the background upload runs.
export const localPhotoUriCache = new Map<string, string>()

// Filenames committed to the store but not yet uploaded to storage.
// useDataSave in settings.tsx filters these out so the DB never receives a
// filename that has no corresponding file in storage, preventing empty slots
// if the app is closed before flush() runs.
export const pendingDeferred = new Set<string>()

async function uploadFileToStorage(uri: string, filename: string, contentType: string, variant: 'normal' | 'blur', token: string, userId: string) {
  const formData = new FormData()
  formData.append('', { uri, name: filename, type: contentType } as any)
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/users/${userId}/${variant}/${filename}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-upsert': 'true' },
      body: formData,
    }
  )
  if (!res.ok) throw new Error(await res.text())
}

async function compressPhoto(uri: string): Promise<string> {
  const MAX_BYTES = 300 * 1024
  const qualities = [0.8, 0.6, 0.45, 0.3]
  let lastUri = uri
  for (const q of qualities) {
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }],
      { compress: q, format: ImageManipulator.SaveFormat.WEBP }
    )
    lastUri = out.uri
    const size = (await (await fetch(out.uri)).blob()).size
    if (size <= MAX_BYTES) return out.uri
  }
  return lastUri
}

// Encodes a blurhash string (~30 chars) from the source image. Pure-JS:
// resize to 32px PNG, decode to RGBA, feed to blurhash encoder. Returns ''
// on failure so the caller can still proceed (rendering falls back to a
// flat placeholder).
async function computeBlurhash(uri: string): Promise<string> {
  try {
    const small = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 32 } }],
      { format: ImageManipulator.SaveFormat.PNG, base64: true }
    )
    const base64 = small.base64
    if (!base64) return ''
    const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const png = UPNG.decode(binary.buffer)
    const rgba = new Uint8ClampedArray(UPNG.toRGBA8(png)[0])
    return encodeBlurhash(rgba, png.width, png.height, 4, 3)
  } catch (e) {
    console.error('blurhash encode failed', e)
    return ''
  }
}

// Public helper: pick the same compress + blurhash + upload pipeline used
// by PhotoEditor, but for a single asset URI. Caller passes the source URI
// (typically from ImagePicker) and gets back the committed filename + hash.
// Also primes localPhotoUriCache so renderers can show the image from the
// device cache while subsequent storage fetches warm the ExpoImage cache.
async function processAndUploadPhoto(uri: string, userId: string, token: string): Promise<ImageData> {
  const normalFilename = `${uuidv4()}.webp`
  const [normalUri, hash] = await Promise.all([
    compressPhoto(uri),
    computeBlurhash(uri),
  ])
  // Prime the local cache before uploading so any render between commit
  // and upload-completion shows the picked photo (mirrors onboarding/deferred).
  localPhotoUriCache.set(normalFilename, normalUri)
  try {
    await uploadFileToStorage(normalUri, normalFilename, 'image/webp', 'normal', token, userId)
  } catch (e) {
    localPhotoUriCache.delete(normalFilename)
    throw e
  }
  return { normal: normalFilename, hash }
}

// Deferred variant: synchronously assigns a filename and primes the local
// cache from the original URI so the UI can render the picked photo
// immediately, then runs compression + blurhash + upload in the background.
// Mirrors the onboarding deferred-upload path (PhotoEditor.deferUpload=true).
//
// Returns the chosen filename and an `uploaded` promise that resolves with
// the final hash once the upload lands. Callers should also `await` the
// promise before persisting the images list to the server so the row
// references a file that actually exists in storage.
export function processAndUploadPhotoDeferred(
  uri: string,
  userId: string,
  token: string,
): { filename: string; uploaded: Promise<string> } {
  const normalFilename = `${uuidv4()}.webp`
  // Prime cache + mark deferred immediately so the UI shows the picked
  // photo and any save path knows to wait for completion.
  localPhotoUriCache.set(normalFilename, uri)
  pendingDeferred.add(normalFilename)
  const uploaded = (async () => {
    try {
      const [normalUri, hash] = await Promise.all([
        compressPhoto(uri),
        computeBlurhash(uri),
      ])
      // Swap the cache entry to the compressed copy so memory pressure
      // pruning the original (ImagePicker tmp file) doesn't break the
      // local placeholder.
      localPhotoUriCache.set(normalFilename, normalUri)
      await uploadFileToStorage(normalUri, normalFilename, 'image/webp', 'normal', token, userId)
      pendingDeferred.delete(normalFilename)
      return hash
    } catch (e) {
      localPhotoUriCache.delete(normalFilename)
      pendingDeferred.delete(normalFilename)
      throw e
    }
  })()
  return { filename: normalFilename, uploaded }
}

export interface PhotoEditorRef {
  flush: () => Promise<void>
}

function PhotoCell({
  uri, localUri, hash, onRemove, onReplace, onLoaded, canRemove, dragging, highlighted, replacing, onLayout,
}: {
  uri: string
  localUri?: string
  hash?: string
  onRemove: () => void
  onReplace?: () => void
  onLoaded?: () => void
  canRemove: boolean
  dragging?: boolean
  highlighted?: boolean
  replacing?: boolean
  onLayout?: (e: any) => void
}) {
  return (
    <Pressable
      style={photoStyles.cell}
      onLayout={onLayout}
      onPress={onReplace && !replacing ? () => { tap(); onReplace() } : undefined}
    >
      <ExpoImage
        source={uri}
        placeholder={localUri ? { uri: localUri } : hash ? { blurhash: hash } : undefined}
        style={photoStyles.img}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={200}
        onLoad={() => onLoaded?.()}
      />
      {(dragging || highlighted) && <View pointerEvents="none" style={photoStyles.dropTarget} />}
      {replacing && (
        <View pointerEvents="none" style={photoStyles.replacingOverlay}>
          {/* Dark ink: the scrim underneath is the opaque white PHOTO_CHROME. */}
          <ActivityIndicator size="large" color={INK} />
        </View>
      )}
      {canRemove && (
        <Pressable style={photoStyles.remove} onPress={() => { tap(); onRemove() }}>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round">
            <Line x1="18" y1="6" x2="6" y2="18" />
            <Line x1="6" y1="6" x2="18" y2="18" />
          </Svg>
        </Pressable>
      )}
    </Pressable>
  )
}

// Draggable photo grid — drag to reorder, X to remove.
function PhotoGrid({
  photos, urlFor, hashFor, onRemove, onReplace, onLoaded, onReorder, canRemove, uploads, replacingFilename,
  additionalChildren, onDragStateChange,
}: {
  photos: string[]
  urlFor: (f: string) => string
  hashFor?: (f: string) => string | undefined
  onRemove: (f: string) => void
  onReplace?: (f: string) => void
  onLoaded: (f: string) => void
  onReorder: (from: number, to: number) => void
  canRemove: boolean
  uploads: { id: string; uri: string; filename?: string }[]
  replacingFilename?: string | null
  additionalChildren?: React.ReactNode
  onDragStateChange?: (dragging: boolean) => void
}) {
  const layouts = useRef<Array<{ x: number; y: number; w: number; h: number }>>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const hoverIdxRef = useRef<number | null>(null)

  const totalDraggable = photos.length
  const totalDraggableRef = useRef(totalDraggable)
  const onReorderRef = useRef(onReorder)
  const onDragStateChangeRef = useRef(onDragStateChange)
  useEffect(() => { totalDraggableRef.current = totalDraggable; layouts.current.length = totalDraggable }, [totalDraggable])
  useEffect(() => { onReorderRef.current = onReorder }, [onReorder])
  useEffect(() => { onDragStateChangeRef.current = onDragStateChange }, [onDragStateChange])

  const sourceIdxRef = useRef<number | null>(null)

  const dragPan = useMemo(() =>
    Gesture.Pan()
      .activateAfterLongPress(300)
      .activeOffsetX([-8, 8])
      .activeOffsetY([-8, 8])
      .onBegin(e => {
        let hit = -1
        for (let i = 0; i < layouts.current.length; i++) {
          const l = layouts.current[i]
          if (!l) continue
          if (e.x >= l.x && e.x <= l.x + l.w && e.y >= l.y && e.y <= l.y + l.h) {
            hit = i
            break
          }
        }
        sourceIdxRef.current = hit >= 0 ? hit : null
        if (hit >= 0) setDragIdx(hit)
      })
      .onStart(() => {
        const idx = sourceIdxRef.current
        if (idx == null) return
        tapMedium()
        onDragStateChangeRef.current?.(true)
      })
      .onUpdate(e => {
        const idx = sourceIdxRef.current
        if (idx == null) return
        const l = layouts.current[idx]
        if (!l) return
        const cx = l.x + l.w / 2 + e.translationX
        const cy = l.y + l.h / 2 + e.translationY
        let best = -1
        let bestDist = Infinity
        for (let i = 0; i < layouts.current.length; i++) {
          const li = layouts.current[i]
          if (!li) continue
          const dx = (li.x + li.w / 2) - cx
          const dy = (li.y + li.h / 2) - cy
          const d = dx * dx + dy * dy
          if (d < bestDist) { bestDist = d; best = i }
        }
        const normalized = best < 0 || best === idx ? null : best
        if (normalized !== hoverIdxRef.current) {
          hoverIdxRef.current = normalized
          setHoverIdx(normalized)
        }
      })
      .onEnd(() => {
        const idx = sourceIdxRef.current
        const target = hoverIdxRef.current
        if (idx != null && target !== null && target >= 0 && target < totalDraggableRef.current && target !== idx) {
          tapSuccess()
          onReorderRef.current(idx, target)
        }
      })
      .onFinalize(() => {
        sourceIdxRef.current = null
        setDragIdx(null)
        setHoverIdx(null)
        hoverIdxRef.current = null
        onDragStateChangeRef.current?.(false)
      })
      .runOnJS(true)
  , [])

  return (
    <GestureDetector gesture={dragPan}>
    <View style={photoStyles.grid} pointerEvents="box-none">
      {photos.map((filename, i) => {
        const matchingUpload = uploads.find(u => u.filename === filename)
        return (
          <PhotoCell
            key={`${i}-${filename}`}
            uri={urlFor(filename)}
            localUri={matchingUpload?.uri ?? localPhotoUriCache.get(filename)}
            hash={hashFor?.(filename)}
            onRemove={() => onRemove(filename)}
            onReplace={onReplace ? () => onReplace(filename) : undefined}
            onLoaded={() => onLoaded(filename)}
            canRemove={canRemove}
            dragging={dragIdx === i}
            highlighted={hoverIdx === i}
            replacing={replacingFilename === filename}
            onLayout={(e) => { layouts.current[i] = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y, w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height } }}
          />
        )
      })}
      {uploads.filter(u => !u.filename).map(u => (
        <View key={u.id} style={photoStyles.cell}>
          {u.uri ? (
            <ExpoImage source={u.uri} style={photoStyles.img} cachePolicy="disk" />
          ) : (
            <View style={photoStyles.placeholderBg}>
              <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
                <Circle cx="12" cy="8" r="4" fill={INK_DIM} />
                <Path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" fill={INK_DIM} />
              </Svg>
            </View>
          )}
          <ActivityIndicator size="small" color={INK} style={photoStyles.placeholderSpinner} />
        </View>
      ))}
      {additionalChildren}
    </View>
    </GestureDetector>
  )
}

// ── Public editor ─────────────────────────────────────────────────────────
// Full photo-management surface used by both the photo sub-page (settings)
// and onboarding step 4. Owns the upload queue, dedupe signature map, and
// the duplicate-detected dialog.
//
// When `deferUpload` is true, picked photos are only compressed locally —
// nothing is sent to storage until the caller invokes `flush()` via the
// forwarded ref. Removes never touch storage; they only drop the reference
// from the images array (the DB update happens on flush / auto-save).
//
// `flush()` first commits filenames to the store and caches local URIs in
// `localPhotoUriCache` (both synchronous), then uploads in the background.
// This lets sibling components (e.g. the thumbnail strip on the profile
// tab) show the photos immediately from the device cache while the upload
// is still in flight.
export const PhotoEditor = forwardRef<PhotoEditorRef, {
  onDragStateChange?: (dragging: boolean) => void
  onUploadingChange?: (uploading: boolean) => void
  deferUpload?: boolean
  onTotalCountChange?: (count: number) => void
}>(function PhotoEditor({
  onDragStateChange,
  onUploadingChange,
  deferUpload,
  onTotalCountChange,
}, ref) {
  const { user } = useAuthStore()
  const { profile, update } = useUserStore()
  const [uploads, setUploads] = useState<{ id: string; uri: string; filename?: string; sig: string }[]>([])
  // Deferred uploads: photos NOT yet in the store, waiting for flush().
  // Keyed by normalFilename. flush() uploads and then commits to the store.
  const pendingUploads = useRef<Map<string, {
    normalFilename: string
    normalUri: string
    hash: string
  }>>(new Map())

  useEffect(() => {
    onUploadingChange?.(uploads.some(u => !u.filename))
  }, [uploads, onUploadingChange])
  // filename → signature map, persists across the session even after the
  // upload cell has disappeared, so re-picking the same asset still dedupes.
  const sigByFilename = useRef<Map<string, string>>(new Map())
  const [duplicateDialog, setDuplicateDialog] = useState(false)
  // Which empty add-slot is waiting for the OS image picker to appear.
  // launchImageLibraryAsync has a noticeable cold-start delay; show a spinner
  // in the tapped "+" slot until the native picker is up (promise resolves).
  const [pickingAddIdx, setPickingAddIdx] = useState<number | null>(null)
  // Filename of the photo currently being replaced (picker open). Drives a
  // spinner overlay on the cell so the user sees what's loading instead of
  // a blank tap while the picker cold-starts.
  const [replacingFilename, setReplacingFilename] = useState<string | null>(null)

  // Warm up the image picker on mount: getMediaLibraryPermissionsAsync()
  // initializes the native bridge so the first launchImageLibraryAsync after
  // this is dramatically faster. Cheap (status read, no permission prompt),
  // errors swallowed.
  useEffect(() => { ImagePicker.getMediaLibraryPermissionsAsync().catch(() => {}) }, [])

  const storeImages = profile?.images ?? []
  const photos = storeImages.map(e => e.normal ?? '')

  useEffect(() => { onTotalCountChange?.(photos.length) }, [photos.length, onTotalCountChange])

  // ── Flush: upload pending deferred photos and persist to the server ──
  // Photos in pendingUploads are committed to the local store but excluded
  // from useDataSave via pendingDeferred until upload succeeds. flush()
  // uploads each file, patches the hash, then calls invoke('app/images')
  // directly so the save is not lost if the parent unmounts before the
  // useDataSave debounce timer can fire.
  const flushRef = useRef<() => Promise<void>>(async () => {})
  const inFlightFlush = useRef<Promise<void> | null>(null)
  flushRef.current = () => {
    if (inFlightFlush.current) return inFlightFlush.current
    const run = async () => {
      const entries = Array.from(pendingUploads.current.values())
      if (entries.length === 0) return
      const failed: string[] = []

      const userId = user?.id
      if (!userId) return

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      for (const lp of entries) {
        try {
          await uploadFileToStorage(lp.normalUri, lp.normalFilename, 'image/webp', 'normal', token, userId)
          pendingDeferred.delete(lp.normalFilename)
          const state = useUserStore.getState().profile
          if (state) {
            const imgs = state.images
            const idx = imgs.findIndex(e => e.normal === lp.normalFilename)
            if (idx >= 0) {
              const next = [...imgs]
              next[idx] = { ...next[idx], hash: lp.hash }
              useUserStore.getState().update({ images: next })
            }
          }
        } catch (e) {
          console.error('Deferred upload error:', e)
          failed.push(lp.normalFilename)
          pendingDeferred.delete(lp.normalFilename)
          const state = useUserStore.getState().profile
          if (state) {
            useUserStore.getState().update({ images: state.images.filter(img => img.normal !== lp.normalFilename) })
          }
        }
        pendingUploads.current.delete(lp.normalFilename)
        localPhotoUriCache.delete(lp.normalFilename)
      }

      // Persist whatever DID land, then surface the failure to the caller.
      // Both of these used to be swallowed (`.catch(console.error)`), and that
      // is how photo-less accounts got created: a failed upload drops the photo
      // from the store (above), onboarding still saved the bio, and
      // _layout.tsx gates the /home redirect on bio ALONE. The user landed in
      // /home with `images: []` and never returned to onboarding, while
      // others(only_available) requires >= 1 image, so they were permanently
      // unmatchable. Callers that genuinely don't care (the unmount safety net)
      // catch this themselves.
      const finalState = useUserStore.getState().profile
      if (finalState) await invoke('app/profile', { images: finalState.images })
      if (failed.length > 0) throw new Error(`photo upload failed (${failed.length})`)
    }
    const p = run().finally(() => { inFlightFlush.current = null })
    inFlightFlush.current = p
    return p
  }

  useImperativeHandle(ref, () => ({ flush: () => flushRef.current() }), [])

  // Safety net: if PhotoEditor unmounts via a path that bypasses the parent's
  // explicit flush() call (swipe-back, hardware-back, etc.), still upload and
  // persist any pending photos. Fire-and-forget — the global store survives
  // even after the parent component is gone.
  useEffect(() => {
    return () => {
      if (pendingUploads.current.size > 0) flushRef.current().catch(console.error)
    }
  }, [])

  const uploadOne = async (asset: ImagePickerAsset): Promise<ImageData | null> => {
    if (!user) return null
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''
    return processAndUploadPhoto(asset.uri, user.id, token)
  }

  const pickPhoto = async (addIdx: number) => {
    if (!user || photos.length >= MAX_PHOTOS) return
    const maxPick = MAX_PHOTOS - photos.length
    setPickingAddIdx(addIdx)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: maxPick,
    }).finally(() => setPickingAddIdx(null))
    if (result.canceled || !result.assets?.length) return

    const sigs = await Promise.all(result.assets.map(async a => {
      // Prefer the system asset ID: stable across separate picker calls,
      // so re-picking the same photo dedupes against the existing copy.
      if (a.assetId) return `id:${a.assetId}`
      try {
        const info = await FileSystem.getInfoAsync(a.uri, { md5: true })
        if (info.exists && info.md5) return info.md5
      } catch {}
      // Last resort: the picker tmp URI itself is unique per asset within
      // a single call, so dedup still works inside the batch.
      return `uri:${a.uri}`
    }))

    const existingSigs = new Set<string>([
      ...Array.from(sigByFilename.current.values()),
      ...uploads.map(u => u.sig),
    ])

    const seenThisBatch = new Set<string>()
    const kept: number[] = []
    result.assets.forEach((_, idx) => {
      const s = sigs[idx]
      if (existingSigs.has(s) || seenThisBatch.has(s)) return
      seenThisBatch.add(s)
      kept.push(idx)
    })
    const filtered = kept.map(i => result.assets[i])
    const filteredSigs = kept.map(i => sigs[i])

    const skipped = result.assets.length - filtered.length
    if (skipped > 0) setDuplicateDialog(true)
    if (filtered.length === 0) return

    const assets = filtered.slice(0, maxPick)

    if (deferUpload) {
      const entries = assets.map((a, i) => {
        const normalFilename = `${uuidv4()}.webp`
        sigByFilename.current.set(normalFilename, filteredSigs[i])
        return { normalFilename, originalUri: a.uri }
      })

      // Commit to the store immediately so the image is visible and reorderable.
      // Also add to pendingDeferred so useDataSave skips it until flush() succeeds,
      // preventing a dangling DB reference if the app closes before the upload runs.
      const currentState = useUserStore.getState().profile
      const currentImages = currentState?.images ?? []
      useUserStore.getState().update({
        images: [
          ...currentImages,
          ...entries.map(e => ({ normal: e.normalFilename, hash: '' }) satisfies ImageData),
        ],
      })
      for (const e of entries) {
        localPhotoUriCache.set(e.normalFilename, e.originalUri)
        pendingUploads.current.set(e.normalFilename, { normalFilename: e.normalFilename, normalUri: e.originalUri, hash: '' })
        pendingDeferred.add(e.normalFilename)
      }

      // Compress in the background; results go into pendingUploads for flush().
      for (const e of entries) {
        try {
          const [normalUri, hash] = await Promise.all([
            compressPhoto(e.originalUri),
            computeBlurhash(e.originalUri),
          ])
          const pending = pendingUploads.current.get(e.normalFilename)
          if (pending) { pending.normalUri = normalUri; if (hash) pending.hash = hash }
        } catch (err) {
          console.error('Photo compress error:', err)
        }
      }
      return
    }

    // Immediate upload path (original behaviour).
    const newUploads = assets.map((a, i) => ({
      id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      uri: a.uri,
      sig: filteredSigs[i],
    }))
    setUploads(prev => [...prev, ...newUploads])

    for (let i = 0; i < assets.length; i++) {
      try {
        const result = await uploadOne(assets[i])
        if (result) {
          sigByFilename.current.set(result.normal!, newUploads[i].sig)
          setUploads(prev => prev.map(u => u.id === newUploads[i].id ? { ...u, filename: result.normal } : u))
          const currentState = useUserStore.getState().profile
          update({ images: [...(currentState?.images ?? []), result] })
        } else {
          setUploads(prev => prev.filter(u => u.id !== newUploads[i].id))
        }
      } catch (e: any) {
        console.error('Photo upload error:', e)
        setUploads(prev => prev.filter(u => u.id !== newUploads[i].id))
      }
    }
  }

  const removePhoto = (filename: string) => {
    if (photos.length <= 2) return
    const idx = storeImages.findIndex(e => e.normal === filename)
    if (idx < 0) return
    sigByFilename.current.delete(filename)
    localPhotoUriCache.delete(filename)
    pendingUploads.current.delete(filename)
    pendingDeferred.delete(filename)
    update({ images: storeImages.filter((_, i) => i !== idx) })
  }

  const replacePhoto = async (oldFilename: string) => {
    if (!user || replacingFilename) return
    const idx = storeImages.findIndex(e => e.normal === oldFilename)
    if (idx < 0) return

    setReplacingFilename(oldFilename)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
    }).finally(() => setReplacingFilename(null))
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]

    if (deferUpload) {
      const normalFilename = `${uuidv4()}.webp`
      const latest = useUserStore.getState().profile
      if (!latest) return
      const targetIdx = latest.images.findIndex(e => e.normal === oldFilename)
      if (targetIdx < 0) return
      const next = [...latest.images]
      next[targetIdx] = { normal: normalFilename, hash: '' }

      sigByFilename.current.delete(oldFilename)
      localPhotoUriCache.delete(oldFilename)
      pendingUploads.current.delete(oldFilename)
      pendingDeferred.delete(oldFilename)

      localPhotoUriCache.set(normalFilename, asset.uri)
      pendingUploads.current.set(normalFilename, { normalFilename, normalUri: asset.uri, hash: '' })
      pendingDeferred.add(normalFilename)
      useUserStore.getState().update({ images: next })

      try {
        const [normalUri, hash] = await Promise.all([
          compressPhoto(asset.uri),
          computeBlurhash(asset.uri),
        ])
        const pending = pendingUploads.current.get(normalFilename)
        if (pending) { pending.normalUri = normalUri; if (hash) pending.hash = hash }
      } catch (err) {
        console.error('Photo compress error:', err)
      }
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''
    try {
      const newImage = await processAndUploadPhoto(asset.uri, user.id, token)
      if (!newImage) return
      const latest = useUserStore.getState().profile
      if (!latest) return
      const targetIdx = latest.images.findIndex(e => e.normal === oldFilename)
      if (targetIdx < 0) return
      const next = [...latest.images]
      next[targetIdx] = newImage
      sigByFilename.current.delete(oldFilename)
      localPhotoUriCache.delete(oldFilename)
      update({ images: next })
    } catch (e) {
      console.error('Photo replace error:', e)
    }
  }

  const reorderPhotos = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length) return
    const next = [...storeImages]
    ;[next[from], next[to]] = [next[to], next[from]]
    update({ images: next })
  }

  const onPhotoLoaded = (filename: string) => {
    setUploads(prev => prev.filter(u => u.filename !== filename))
  }

  return (
    <>
      <PhotoGrid
        photos={photos}
        urlFor={(f) => localPhotoUriCache.get(f) ?? `${SUPABASE_URL}/storage/v1/object/public/users/${user!.id}/normal/${f}`}
        hashFor={(f) => storeImages.find(e => e.normal === f)?.hash || undefined}
        onRemove={removePhoto}
        onReplace={replacePhoto}
        onLoaded={onPhotoLoaded}
        onReorder={reorderPhotos}
        canRemove={photos.length > 2}
        uploads={uploads}
        replacingFilename={replacingFilename}
        onDragStateChange={onDragStateChange}
        additionalChildren={
          (() => {
            const filledCount = photos.length + uploads.filter(u => !u.filename).length
            // Two slots on an empty grid — that is the minimum the step asks
            // for, so the requirement is visible as shape. After the first
            // photo one slot trails the set, and none once it is full.
            const emptySlots = filledCount === 0 ? MIN_PHOTOS : filledCount >= MAX_PHOTOS ? 0 : 1
            return Array.from({ length: emptySlots }).map((_, i) => (
              <Pressable
                key={`add-${i}`}
                style={[photoStyles.cell, photoStyles.add]}
                onPress={() => { if (pickingAddIdx !== null) return; tap(); pickPhoto(i) }}
              >
                {pickingAddIdx === i ? (
                  <ActivityIndicator size="small" color={INK} />
                ) : (
                  <Svg pointerEvents="none" width={ICON.xxl} height={ICON.xxl} viewBox="0 0 24 24" fill="none" stroke={INK_HINT} strokeWidth={STROKE.thin} strokeLinecap="round">
                    <Path d="M12 5v14M5 12h14" />
                  </Svg>
                )}
              </Pressable>
            ))
          })()
        }
      />
      <ConfirmDialog
        visible={duplicateDialog}
        title={t('settings.duplicatePhotoTitle')}
        description={t('settings.duplicatePhotoBody')}
        confirmLabel={t('common.gotIt')}
        onConfirm={() => setDuplicateDialog(false)}
        draggable
      />
    </>
  )
})

const photoStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    // Centered, with a real column gap. The previous layout was
    // `space-between` plus invisible filler cells padding every partial row
    // out to three — that only ever produced a left-aligned last row. With a
    // gap the tiles centre on their own and the fillers are gone. 31% x3 +
    // 2 gaps fits any container wider than 228px, so it never wraps to two.
    justifyContent: 'center',
    columnGap: SM,
    rowGap: SM,
    // No top margin: the gap above the grid belongs to the host layout, so
    // the photo step's title→grid distance is the same single XL every other
    // onboarding step puts between its title and its fields.
    overflow: 'visible',
  },
  cell: { width: '31%', aspectRatio: 3 / 4, borderRadius: RADIUS, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  placeholderBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderSpinner: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
  },
  remove: {
    position: 'absolute', top: 6, end: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: PHOTO_CHROME,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: SHADOW_BLACK, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 3,
  },
  // Empty slot: a white surface behind the warm hairline — the same skin the
  // onboarding name/date/bio fields and the login email field wear, since an
  // empty slot is a field waiting to be filled. Geometry comes from `cell` so
  // an add slot and a photo are the same tile.
  add: {
    ...FIELD_SKIN,
    alignItems: 'center', justifyContent: 'center',
  },
  dropTarget: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WHITE_MID,
    borderRadius: RADIUS,
  },
  replacingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PHOTO_CHROME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerBadge: {
    position: 'absolute',
    top: '50%', start: '50%',
    width: 36, height: 36, marginStart: -18, marginTop: -18,
    borderRadius: RADIUS,
    backgroundColor: PHOTO_CHROME,
    alignItems: 'center', justifyContent: 'center',
  },
})
