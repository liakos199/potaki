import { View, Text, ScrollView, StyleSheet } from "react-native"
import { useLocalSearchParams } from "expo-router"
import BarInfoSection from "@/src/features/owner-components/bar-info-section"

const EditBarScreen = (): JSX.Element | null => {
  const { barId } = useLocalSearchParams<{ barId: string }>()

  if (!barId) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: Bar ID is missing.</Text>
        <Text style={styles.errorSubtext}>Cannot load bar information.</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Section 1: Bar Information - Pass only barId */}
        <BarInfoSection barId={barId} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121826",
  },
  scrollView: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1A202C",
    padding: 16,
  },
  errorText: {
    color: "#FF5A5A",
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "600",
  },
  errorSubtext: {
    color: "#A0AEC0",
    fontSize: 12,
  },
})

export default EditBarScreen
