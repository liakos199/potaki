import { StyleSheet, Text, View, ScrollView } from 'react-native'
import React from 'react'
import BarOperatingHours from '@/src/features/owner-components/operating-hours/bar-operating-hours'
import { useLocalSearchParams } from 'expo-router'

const hours = () => {
  const { barId } = useLocalSearchParams<{ barId: string }>()
  return (

<View style={styles.container}>
<ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
<BarOperatingHours barId={barId} />
</ScrollView>
</View>
  )
}

export default hours

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#121826",
      },
      scrollView: {
        flex: 1,
      },
      scrollContent: {
        paddingBottom: 32,
      },
})