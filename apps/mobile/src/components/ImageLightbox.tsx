import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ImageLightboxProps = {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
};

export function ImageLightbox({ visible, images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<string>>(null);
  const [width, setWidth] = useState(() => Dimensions.get('window').width);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Reset to the requested image each time the lightbox is opened.
  useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(Math.max(0, Math.min(next, images.length - 1)));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={styles.backdrop}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {/* Tapping empty space closes. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close image" />

        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, index) => `${item}-${index}`}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={({ item }) => (
            <Pressable style={[styles.page, { width }]} onPress={onClose}>
              <Image source={{ uri: item }} style={styles.image} resizeMode="contain" />
            </Pressable>
          )}
        />

        {images.length > 1 ? (
          <View style={[styles.dots, { bottom: insets.bottom + 24 }]} pointerEvents="none">
            {images.map((item, index) => (
              <View
                key={`${item}-dot`}
                style={[styles.dot, index === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        ) : null}

        <Pressable
          style={[styles.closeButton, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close image"
        >
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '600' },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff' },
});

export default ImageLightbox;
