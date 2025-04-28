import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, Image, TextInput, RefreshControl} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, MapPin, Calendar, X, ChevronRight, ImageIcon, Star, Filter, Heart, Map } from 'lucide-react-native';
import { format } from 'date-fns';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

// Define the Bar type based on our database schema
type Bar = {
  id: string;
  name: string;
  address: string;
  description: string | null;
  phone: string | null;
  website: string | null;
  imageUrl?: string;
  isFavorite?: boolean;
};

const CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'trending', name: 'Trending' },
  { id: 'cocktail', name: 'Cocktail' },
  { id: 'wine', name: 'Wine' },
  { id: 'sports', name: 'Sports' },
  { id: 'live-music', name: 'Live Music' },
];

const HomeScreen = (): JSX.Element => {
  const [bars, setBars] = useState<Bar[]>([]);
  const [filteredBars, setFilteredBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const router = useRouter();

  // Function to get image URL from Supabase Storage
  const getImageUrl = useCallback(async (barId: string): Promise<string | undefined> => {
    try {
      // @ts-ignore - We know bar_images exists in the database
      const { data, error } = await supabase
        .from('bar_images')
        .select('*')
        .eq('bar_id', barId)
        .eq('is_primary', true)
        .limit(1);
      
      if (error || !data || data.length === 0) {
        // Fallback to any image if no primary image
        // @ts-ignore - We know bar_images exists in the database
        const { data: anyImage, error: anyImageError } = await supabase
          .from('bar_images')
          .select('*')
          .eq('bar_id', barId)
          .limit(1);
          
        if (anyImageError || !anyImage || anyImage.length === 0) {
          // Return placeholder if no images at all
          return `https://source.unsplash.com/random/300x200/?bar,${barId}`;
        }
        
        // Get URL for the first image
        const { data: urlData } = await supabase
          .storage
          .from('bar-images')
          .createSignedUrl(anyImage[0].file_path, 60 * 60); // 1 hour expiry
          
        return urlData?.signedUrl;
      }
      
      // Get URL for primary image
      const { data: urlData } = await supabase
        .storage
        .from('bar-images')
        .createSignedUrl(data[0].file_path, 60 * 60); // 1 hour expiry
        
      return urlData?.signedUrl;
    } catch (error) {
      console.error('Error fetching bar image:', error);
      return undefined;
    }
  }, []);

  // Fetch bars from Supabase
  const fetchBars = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bars')
      .select('id, name, address, description, phone, website')
      .eq('live', true) // Only show bars that are live
      .order('name');
    
    if (!error && data) {
      // Fetch images for each bar
      const barsWithImagesPromises = data.map(async (bar) => {
        const imageUrl = await getImageUrl(bar.id);
        return {
          ...bar,
          imageUrl: imageUrl || `https://source.unsplash.com/random/300x200/?bar,${bar.name.replace(/\s/g, '')}`,
          isFavorite: Math.random() > 0.7, // Random favorite status for demo
        };
      });
      
      const barsWithImages = await Promise.all(barsWithImagesPromises);
      setBars(barsWithImages);
      setFilteredBars(barsWithImages);
    } else {
      console.error('Error fetching bars:', error);
    }
    setLoading(false);
  }, [getImageUrl]);

  // Initial data fetch
  useEffect(() => {
    fetchBars();
  }, [fetchBars]);

  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBars();
    setRefreshing(false);
  }, [fetchBars]);

  // Filter bars based on search query and category
  useEffect(() => {
    let filtered = bars;
    
    // Apply search filter
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        bar => 
          bar.name.toLowerCase().includes(query) || 
          (bar.address && bar.address.toLowerCase().includes(query)) ||
          (bar.description && bar.description.toLowerCase().includes(query))
      );
    }
    
    // Apply category filter
    if (activeCategory !== 'all') {
      // This is a mock implementation since we don't have real categories
      // In a real app, you would filter based on actual category data
      if (activeCategory === 'trending') {
        filtered = filtered.filter((_, index) => index % 3 === 0);
      } else if (activeCategory === 'cocktail') {
        filtered = filtered.filter((_, index) => index % 4 === 1);
      } else if (activeCategory === 'wine') {
        filtered = filtered.filter((_, index) => index % 4 === 2);
      } else if (activeCategory === 'sports') {
        filtered = filtered.filter((_, index) => index % 5 === 3);
      } else if (activeCategory === 'live-music') {
        filtered = filtered.filter((_, index) => index % 5 === 4);
      }
    }
    
    setFilteredBars(filtered);
  }, [searchQuery, activeCategory, bars]);

  // Clear search query
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Navigate to bar details
  const handleBarPress = useCallback((barId: string) => {
    router.push(`/bar/${barId}`);
  }, [router]);

  // Toggle favorite status
  const toggleFavorite = useCallback((barId: string) => {
    setBars(prevBars => 
      prevBars.map(bar => 
        bar.id === barId ? { ...bar, isFavorite: !bar.isFavorite } : bar
      )
    );
  }, []);

  // Today's date for the header
  const today = useMemo(() => format(new Date(), 'EEEE, MMMM do'), []);

  // Loading state
  if (loading && !refreshing) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0f0f13]">
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#f01669" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0f0f13]">
      <StatusBar style="light" />
      
      {/* Header */}
      <View className="px-5 pt-2 pb-4">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <View className="flex-row items-center">
              <Calendar size={14} color="#9ca3af" />
              <Text className="text-sm text-gray-400 font-medium ml-1">
                {today}
              </Text>
            </View>
            <Text className="text-3xl font-bold text-white mt-1">Nightlife</Text>
          </View>
          
          <View className="flex-row">
            <Pressable
              className="w-10 h-10 rounded-full bg-[#1f1f27] items-center justify-center mr-3"
              // onPress={() => router.push('/map')}
            >
              <Map size={18} color="#f01669" />
            </Pressable>
            
            <Pressable
              className="w-10 h-10 rounded-full bg-[#1f1f27] items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="User profile"
              // onPress={() => router.push('/profile')}
            >
              <Image 
                source={{ uri: 'https://ui-avatars.com/api/?background=f01669&color=fff' }} 
                className="h-10 w-10 rounded-full" 
              />
            </Pressable>
          </View>
        </View>

        {/* Search bar */}
        <View className="flex-row items-center bg-[#1f1f27] rounded-xl px-4 py-3 mb-5">
          <Search size={18} color="#9ca3af" />
          <TextInput
            className="flex-1 ml-3 text-base text-white"
            placeholder="Search bars by name or location..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={handleClearSearch} hitSlop={8}>
              <X size={18} color="#9ca3af" />
            </Pressable>
          ) : (
            <Pressable onPress={() => {/* Open filters */}} hitSlop={8}>
              <Filter size={18} color="#f01669" />
            </Pressable>
          )}
        </View>
        
        {/* Categories */}
        <FlatList
          data={CATEGORIES}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-5"
          renderItem={({ item }) => (
            <Pressable 
              className={`px-4 py-2 mr-2 rounded-full ${
                activeCategory === item.id ? 'bg-[#f01669]' : 'bg-[#1f1f27]'
              }`}
              onPress={() => setActiveCategory(item.id)}
            >
              <Text className={`${
                activeCategory === item.id ? 'text-white font-medium' : 'text-gray-300'
              }`}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {/* Bar list */}
      {filteredBars.length === 0 ? (
        <View className="flex-1 justify-center items-center px-4">
          <Text className="text-center text-gray-400 text-lg">
            {searchQuery.length > 0 
              ? `No bars found matching "${searchQuery}"`
              : "No bars available at the moment."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredBars}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-5 pb-20"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor="#f01669" 
              colors={["#f01669"]}
            />
          }
          renderItem={({ item }) => (
            <Pressable 
              className="mb-6 bg-[#1f1f27] rounded-2xl overflow-hidden"
              style={{ 
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
                elevation: 10
              }}
              onPress={() => handleBarPress(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`View details for ${item.name}`}
            >
              <View className="relative">
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    className="w-full h-52"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="w-full h-52 bg-[#2a2a35] items-center justify-center">
                    <ImageIcon size={32} color="#9ca3af" />
                    <Text className="text-gray-400 mt-2">No image available</Text>
                  </View>
                )}
                
                {/* Image overlay gradient */}
                <LinearGradient
                  colors={['transparent', 'rgba(31, 31, 39, 0.8)']}
                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 }}
                />
                
                {/* Rating badge */}
                <View className="absolute top-3 left-3 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full flex-row items-center">
                  <Star size={14} color="#ffb800" fill="#ffb800" />
                  <Text className="text-white ml-1 font-medium">
                    {(4 + Math.random()).toFixed(1)}
                  </Text>
                </View>
                
                {/* Favorite button */}
                <Pressable 
                  className="absolute top-3 right-3 w-9 h-9 bg-black/40 backdrop-blur-md rounded-full items-center justify-center"
                  onPress={() => toggleFavorite(item.id)}
                >
                  <Heart 
                    size={18} 
                    color={item.isFavorite ? "#f01669" : "#fff"} 
                    fill={item.isFavorite ? "#f01669" : "none"} 
                  />
                </Pressable>
                
                {/* Name on image */}
                <View className="absolute bottom-3 left-3 right-3">
                  <Text className="text-xl font-bold text-white">{item.name}</Text>
                </View>
              </View>
              
              <View className="p-4">
                <View className="flex-row items-center mb-3">
                  <MapPin size={16} color="#9ca3af" />
                  <Text className="text-gray-300 ml-2 flex-1">{item.address}</Text>
                </View>
                
                {item.description && (
                  <Text className="text-gray-400 mb-4" numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
                
                <View className="flex-row justify-between items-center mt-1">
                  <View className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                    <Text className="text-green-400 font-medium">Open Now</Text>
                  </View>
                  
                  <Pressable 
                    className="flex-row items-center bg-[#f01669] px-4 py-2 rounded-xl"
                    onPress={() => handleBarPress(item.id)}
                  >
                    <Text className="text-white font-semibold mr-1">View</Text>
                    <ChevronRight size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
};

export default HomeScreen;