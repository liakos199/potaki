import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Pressable, Linking, FlatList, Dimensions, StyleSheet, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Phone, Globe, Clock, ArrowLeft, Star, ChevronLeft, ChevronRight, ImageIcon, Calendar, Heart, Share2, MessageCircle } from 'lucide-react-native';
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
};

// Bar image type
type BarImage = {
  id: string;
  bar_id: string;
  file_path: string;
  is_primary: boolean;
  display_order: number;
  url: string;
};

// Define the operating hours type
type OperatingHours = {
  id: string;
  day_of_week: string;
  open_time: string;
  close_time: string;
  closes_next_day: boolean;
};

const BarDetailsScreen = (): JSX.Element => {
  const { barId } = useLocalSearchParams();
  const router = useRouter();
  const [bar, setBar] = useState<Bar | null>(null);
  const [operatingHours, setOperatingHours] = useState<OperatingHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [barImages, setBarImages] = useState<BarImage[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const windowWidth = Dimensions.get('window').width;
  const flatListRef = useRef<FlatList>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Fetch bar images
  const fetchBarImages = useCallback(async (barIdString: string) => {
    try {
      // @ts-ignore - We know bar_images exists in the database
      const { data, error } = await supabase
        .from('bar_images')
        .select('*')
        .eq('bar_id', barIdString)
        .order('display_order', { ascending: true });
      
      if (error) {
        console.error('Error fetching bar images:', error);
        return [];
      }
      
      if (!data || data.length === 0) {
        return [];
      }
      
      // Get signed URLs for all images
      const imagesWithUrls = await Promise.all(
        data.map(async (image) => {
          const { data: urlData } = await supabase
            .storage
            .from('bar-images')
            .createSignedUrl(image.file_path, 60 * 60); // 1 hour expiry
          
          return {
            ...image,
            url: urlData?.signedUrl || ''
          } as BarImage;
        })
      );
      
      return imagesWithUrls;
    } catch (error) {
      console.error('Error processing bar images:', error);
      return [];
    }
  }, []);

  // Fetch bar details from Supabase
  const fetchBarDetails = useCallback(async () => {
    if (!barId) return;

    // Ensure barId is treated as a string
    const barIdString = Array.isArray(barId) ? barId[0] : barId;
    
    setLoading(true);
    
    // Fetch bar details
    const { data: barData, error: barError } = await supabase
      .from('bars')
      .select('id, name, address, description, phone, website')
      .eq('id', barIdString)
      .single();
    
    if (barError) {
      console.error('Error fetching bar details:', barError);
      setLoading(false);
      return;
    }
    
    // Fetch operating hours
    const { data: hoursData, error: hoursError } = await supabase
      .from('operating_hours')
      .select('id, day_of_week, open_time, close_time, closes_next_day')
      .eq('bar_id', barIdString)
      .order('day_of_week');
    
    if (hoursError) {
      console.error('Error fetching operating hours:', hoursError);
    }
    
    // Fetch bar images
    const images = await fetchBarImages(barIdString);
    setBarImages(images);
    
    if (barData) {
      // Set the default image URL if no images found
      const defaultImageUrl = images.length > 0 
        ? images.find(img => img.is_primary)?.url || images[0].url 
        : `https://source.unsplash.com/random/800x400/?bar,${barData.name.replace(/\s/g, '')}`;
        
      setBar({
        ...barData,
        imageUrl: defaultImageUrl,
      });
      
      if (hoursData) {
        setOperatingHours(hoursData);
      }
    }
    
    setLoading(false);
  }, [barId, fetchBarImages]);

  useEffect(() => {
    fetchBarDetails();
  }, [fetchBarDetails]);

  // Handle phone call
  const handlePhoneCall = useCallback(() => {
    if (bar?.phone) {
      Linking.openURL(`tel:${bar.phone}`);
    }
  }, [bar]);

  // Handle website visit
  const handleWebsiteVisit = useCallback(() => {
    if (bar?.website) {
      Linking.openURL(bar.website.startsWith('http') ? bar.website : `https://${bar.website}`);
    }
  }, [bar]);

  // Format day of week
  const formatDayOfWeek = (day: string): string => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days[parseInt(day) - 1] || day;
  };

  // Format time
  const formatTime = (time: string): string => {
    try {
      // Parse time in format HH:MM:SS
      const [hours, minutes] = time.split(':');
      const date = new Date();
      date.setHours(parseInt(hours), parseInt(minutes), 0);
      
      return format(date, 'h:mm a');
    } catch (error) {
      return time;
    }
  };

  // Check if a day is today
  const isToday = (day: string): boolean => {
    const today = new Date().getDay();
    // Convert from Sunday=0 to Monday=1 format
    const adjustedToday = today === 0 ? 7 : today;
    return parseInt(day) === adjustedToday;
  };

  // Toggle favorite
  const toggleFavorite = () => {
    setIsFavorite(!isFavorite);
    // Here you would also update the database
  };

  // Header opacity based on scroll
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Loading state
  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0f0f13]">
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#f01669" />
      </View>
    );
  }

  // Bar not found
  if (!bar) {
    return (
      <SafeAreaView className="flex-1 bg-[#0f0f13]">
        <StatusBar style="light" />
        <View className="px-5 py-4">
          <Pressable
            className="mb-4"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#fff" />
          </Pressable>
          
          <View className="flex-1 justify-center items-center">
            <Text className="text-xl text-center text-gray-400">
              Bar not found or has been removed.
            </Text>
            <Pressable
              className="mt-6 px-6 py-3 bg-[#f01669] rounded-lg"
              accessibilityRole="button"
              accessibilityLabel="Go back to home"
              onPress={() => router.push('/')}
            >
              <Text className="text-white font-semibold">Back to Home</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-[#0f0f13]">
      <StatusBar style="light" />
      
      {/* Animated header */}
      <Animated.View 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 90,
          backgroundColor: '#0f0f13',
          zIndex: 10,
          opacity: headerOpacity,
          paddingTop: 45,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomWidth: 1,
          borderBottomColor: '#1f1f27'
        }}
      >
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </Pressable>
        <Text className="text-white font-bold text-lg" numberOfLines={1}>
          {bar.name}
        </Text>
        <Pressable onPress={toggleFavorite}>
          <Heart size={24} color={isFavorite ? "#f01669" : "#fff"} fill={isFavorite ? "#f01669" : "none"} />
        </Pressable>
      </Animated.View>
      
      <Animated.ScrollView 
        className="flex-1" 
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        {/* Hero Image Section */}
        <View className="relative">
          {barImages.length > 0 ? (
            <View>
              <FlatList
                ref={flatListRef}
                data={barImages}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const newIndex = Math.round(
                    e.nativeEvent.contentOffset.x / windowWidth
                  );
                  setActiveImageIndex(newIndex);
                }}
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item.url }}
                    style={{ width: windowWidth, height: 400 }}
                    resizeMode="cover"
                  />
                )}
              />
              
              {/* Image pagination indicators */}
              {barImages.length > 1 && (
                <View className="absolute bottom-24 left-0 right-0 flex-row justify-center">
                  {barImages.map((_, index) => (
                    <View 
                      key={index} 
                      className={`h-1.5 w-${index === activeImageIndex ? '6' : '1.5'} mx-1 rounded-full ${
                        index === activeImageIndex ? 'bg-[#f01669]' : 'bg-white/50'
                      }`} 
                      style={{ width: index === activeImageIndex ? 24 : 6 }}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : (
            bar?.imageUrl ? (
              <Image
                source={{ uri: bar.imageUrl }}
                style={{ width: windowWidth, height: 400 }}
                resizeMode="cover"
              />
            ) : (
              <View className="w-full h-96 bg-[#1f1f27] items-center justify-center">
                <ImageIcon size={40} color="#9ca3af" />
                <Text className="text-gray-400 mt-2">No images available</Text>
              </View>
            )
          )}
          
          {/* Gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(15, 15, 19, 0.8)', '#0f0f13']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 150 }}
          />
          
          {/* Back button */}
          <View className="absolute top-12 left-5 right-5 flex-row justify-between">
            <Pressable
              className="w-10 h-10 bg-black/30 backdrop-blur-md rounded-full justify-center items-center"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
            >
              <ArrowLeft size={20} color="#fff" />
            </Pressable>
            
            <View className="flex-row">
              <Pressable
                className="w-10 h-10 bg-black/30 backdrop-blur-md rounded-full justify-center items-center mr-3"
                onPress={() => {/* Handle share */}}
              >
                <Share2 size={18} color="#fff" />
              </Pressable>
              
              <Pressable
                className="w-10 h-10 bg-black/30 backdrop-blur-md rounded-full justify-center items-center"
                onPress={toggleFavorite}
              >
                <Heart size={18} color={isFavorite ? "#f01669" : "#fff"} fill={isFavorite ? "#f01669" : "none"} />
              </Pressable>
            </View>
          </View>
          
          {/* Rating badge */}
          <View className="absolute top-12 left-1/2 -ml-16 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full flex-row items-center">
            <Star size={14} color="#ffb800" fill="#ffb800" />
            <Text className="text-white ml-1 font-medium">4.8</Text>
            <Text className="text-gray-300 ml-1 text-xs">(124 reviews)</Text>
          </View>
          
          {/* Title section - positioned over the gradient */}
          <View className="absolute bottom-0 left-0 right-0 px-5 pb-6">
            <Text className="text-3xl font-bold text-white mb-1">{bar.name}</Text>
            <View className="flex-row items-center">
              <MapPin size={14} color="#9ca3af" />
              <Text className="text-gray-300 ml-1 text-sm">{bar.address}</Text>
            </View>
          </View>
        </View>
        
        {/* Content */}
        <View className="px-5 -mt-2">
          {/* Quick actions */}
          <View className="flex-row justify-between mb-6 border-b border-[#1f1f27] pb-6">
            <Pressable 
              className="items-center"
              onPress={() => router.push(`/reservation/new?barId=${bar.id}`)}
            >
              <View className="w-12 h-12 rounded-full bg-[#f01669]/10 items-center justify-center mb-1">
                <Calendar size={20} color="#f01669" />
              </View>
              <Text className="text-white text-xs">Reserve</Text>
            </Pressable>
            
            <Pressable 
              className="items-center"
              onPress={handlePhoneCall}
              disabled={!bar.phone}
            >
              <View className="w-12 h-12 rounded-full bg-[#f01669]/10 items-center justify-center mb-1">
                <Phone size={20} color="#f01669" />
              </View>
              <Text className="text-white text-xs">Call</Text>
            </Pressable>
            
            <Pressable 
              className="items-center"
              onPress={handleWebsiteVisit}
              disabled={!bar.website}
            >
              <View className="w-12 h-12 rounded-full bg-[#f01669]/10 items-center justify-center mb-1">
                <Globe size={20} color="#f01669" />
              </View>
              <Text className="text-white text-xs">Website</Text>
            </Pressable>
            
            <Pressable 
              className="items-center"
              onPress={() => {/* Handle directions */}}
            >
              <View className="w-12 h-12 rounded-full bg-[#f01669]/10 items-center justify-center mb-1">
                <MapPin size={20} color="#f01669" />
              </View>
              <Text className="text-white text-xs">Directions</Text>
            </Pressable>
          </View>
          
          {/* Description */}
          {bar.description && (
            <View className="mb-6">
              <Text className="text-lg font-semibold text-white mb-2">About Us</Text>
              <Text className="text-gray-300 leading-6">{bar.description}</Text>
            </View>
          )}
          
          {/* Operating Hours */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-white mb-3">Hours & Time</Text>
            
            {operatingHours.length > 0 ? (
              <View className="bg-[#1f1f27] rounded-2xl p-4">
                {operatingHours.map((hour) => (
                  <View 
                    key={hour.id} 
                    className={`flex-row justify-between py-2.5 ${
                      isToday(hour.day_of_week) 
                        ? 'bg-[#f01669]/10 -mx-2 px-2 rounded-xl' 
                        : 'border-b border-[#2a2a35]'
                    } ${
                      hour.id === operatingHours[operatingHours.length - 1].id && !isToday(hour.day_of_week) 
                        ? 'border-b-0' 
                        : ''
                    }`}
                  >
                    <View className="flex-row items-center">
                      {isToday(hour.day_of_week) && (
                        <View className="w-2 h-2 rounded-full bg-[#f01669] mr-2" />
                      )}
                      <Text className={`${
                        isToday(hour.day_of_week) ? 'text-white font-medium' : 'text-gray-400'
                      }`}>
                        {formatDayOfWeek(hour.day_of_week)}
                      </Text>
                    </View>
                    <Text className={`${
                      isToday(hour.day_of_week) ? 'text-white' : 'text-gray-400'
                    }`}>
                      {formatTime(hour.open_time)} - {formatTime(hour.close_time)}
                      {hour.closes_next_day && ' (Next day)'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-gray-400 italic">
                Operating hours not available
              </Text>
            )}
          </View>
          
          {/* Make Reservation Button */}
          <Pressable
            className="mb-20 py-4 bg-[#f01669] rounded-xl items-center"
            accessibilityRole="button"
            accessibilityLabel="Make a reservation"
            onPress={() => router.push(`/reservation/new?barId=${bar.id}`)}
          >
            <Text className="text-white text-lg font-semibold">Make a Reservation</Text>
          </Pressable>
        </View>
      </Animated.ScrollView>
    </View>
  );
};

export default BarDetailsScreen;