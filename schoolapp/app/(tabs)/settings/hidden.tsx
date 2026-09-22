import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, useColorScheme, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, auth } from "../../../firebaseConfig";
import { doc, getDoc, updateDoc, arrayRemove } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface HiddenItem {
  id: string;
  title: string;
  type: 'post' | 'comment';
}

export default function HiddenContentScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [hiddenList, setHiddenList] = useState<HiddenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isMounted = useRef(true);

  const theme = useMemo(() => ({
    background: isDark ? '#111111' : '#F2F4F6',
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1F27',
    subText: isDark ? '#9CA3AF' : '#6B7684',
    border: isDark ? '#2C2C2E' : '#E9ECEF',
    accent: '#82A977',
  }), [isDark]);
  
  useEffect(() => {
    isMounted.current = true;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadHiddenContent(user.uid);
      } else {
        setHiddenList([]);
        setLoading(false);
      }
    });
    return () => {
      isMounted.current = false;
      unsub();
    };
  }, []);

  const loadHiddenContent = async (uid: string) => {
    setLoading(true);
    setError(false);
    try {
      const userDoc = await getDoc(doc(db, "users", uid));
      if (!userDoc.exists()) {
        if (isMounted.current) setHiddenList([]);
        return;
      }

      const userData = userDoc.data();
      const postIds: string[] = userData.hiddenPosts || [];
      const commentIds: string[] = userData.hiddenComments || [];

      const postPromises = postIds.map(async (id): Promise<HiddenItem> => {
        try {
          const postDoc = await getDoc(doc(db, "posts", id));
          return {
            id,
            title: postDoc.exists()
              ? (postDoc.data().title || "(제목 없음)")
              : "삭제된 게시글입니다.",
            type: 'post',
          };
        } catch {
          return { id, title: "불러올 수 없는 게시글", type: 'post' };
        }
      });
      const commentPromises = commentIds.map(async (id): Promise<HiddenItem> => {
        try {
          const commentDoc = await getDoc(doc(db, "comments", id));
          return {
            id,
            title: commentDoc.exists()
              ? (commentDoc.data().content || "(내용 없음)")
              : "삭제된 댓글입니다.",
            type: 'comment',
          };
        } catch {
          return { id, title: "불러올 수 없는 댓글", type: 'comment' };
        }
      });

      const [resolvedPosts, resolvedComments] = await Promise.all([
        Promise.all(postPromises),
        Promise.all(commentPromises),
      ]);

      if (isMounted.current) {
        setHiddenList([...resolvedPosts, ...resolvedComments]);
      }
    } catch (e) {
      console.log("숨김 목록 로드 실패", e);
      if (isMounted.current) setError(true);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleRefresh = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setRefreshing(true);
    await loadHiddenContent(uid);
    if (isMounted.current) setRefreshing(false);
  };

  const handleRetry = () => {
    const uid = auth.currentUser?.uid;
    if (uid) loadHiddenContent(uid);
  };

  const handleUnhide = (item: HiddenItem) => {
    Alert.alert(
      "숨김 해제",
      "이 콘텐츠를 다시 보이게 설정하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "해제",
          onPress: async () => {
            const uid = auth.currentUser?.uid;
            if (!uid) return;
            try {
              const userRef = doc(db, "users", uid);

              if (item.type === 'post') {
                await updateDoc(userRef, { hiddenPosts: arrayRemove(item.id) });
              } else {
                await updateDoc(userRef, { hiddenComments: arrayRemove(item.id) });
              }
              setHiddenList(prev =>
                prev.filter(i => !(i.id === item.id && i.type === item.type))
              );
              Alert.alert("알림", "숨김이 해제되었습니다.");
            } catch (e) {
              Alert.alert("오류", "숨김 해제 처리에 실패했습니다.");
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: HiddenItem }) => (
    <View style={[styles.itemContainer, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
      <View style={styles.itemLeft}>
        <View style={[styles.typeBadge, { backgroundColor: item.type === 'post' ? '#82A97720' : '#3182F620' }]}>
          <Text style={[styles.typeText, { color: item.type === 'post' ? theme.accent : '#3182F6' }]}>
            {item.type === 'post' ? '게시글' : '댓글'}
          </Text>
        </View>
        <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
          {item.title}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.unhideBtn, { borderColor: theme.border }]}
        onPress={() => handleUnhide(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.type === 'post' ? '게시글' : '댓글'} 숨김 해제`}
      >
        <Text style={[styles.unhideBtnText, { color: theme.subText }]}>숨김 해제</Text>
      </TouchableOpacity>
    </View>
  );

  const renderBody = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.subText} style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyText, { color: theme.subText }]}>목록을 불러오지 못했습니다.</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { borderColor: theme.border }]}
            onPress={handleRetry}
          >
            <Text style={[styles.unhideBtnText, { color: theme.text }]}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (hiddenList.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="eye-off-outline" size={48} color={theme.subText} style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyText, { color: theme.subText }]}>숨긴 콘텐츠가 없습니다.</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={hiddenList}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>숨김 콘텐츠 관리</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      {renderBody()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  headerRightPlaceholder: { width: 32 },
  listContainer: { paddingTop: 10 },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 15 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 12 },
  typeText: { fontSize: 11, fontWeight: '700' },
  itemTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  unhideBtn: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  unhideBtnText: { fontSize: 13, fontWeight: '600' },
  retryBtn: { marginTop: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 },
  emptyText: { fontSize: 15, fontWeight: '500' }
});
