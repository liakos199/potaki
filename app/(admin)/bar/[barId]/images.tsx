import { useCallback, useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, UploadCloud, Star, Image as ImageIcon } from 'lucide-react-native';
import { decode } from 'base64-arraybuffer';
import uuid from 'react-native-uuid';
import Toast from '@/components/general/Toast';
import { useColorScheme } from 'react-native';

// Image type definition
type BarImage = {
  id: string;
  bar_id: string | null;
  file_path: string;
  is_primary: boolean | null;
  display_order: number;
  created_at: string | null;
  updated_at: string | null;
  url?: string;
};

// Main component
export default function BarImagesScreen() {
  const { barId } = useLocalSearchParams();
  const barIdString = Array.isArray(barId) ? barId[0] : barId;
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [actionInProgress, setActionInProgress] = useState<{id: string, type: 'delete' | 'primary'} | null>(null);
  const queryClient = useQueryClient();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Function to check if the current user is the bar owner
  const checkOwnership = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('bars')
      .select('owner_id')
      .eq('id', barIdString)
      .single();

    if (error || !data) return false;
    return data.owner_id === user.id;
  }, [barIdString]);

  // Fetch bar images
  const { data: images, isLoading, error, refetch } = useQuery({
    queryKey: ['barImages', barIdString],
    queryFn: async () => {
      // Verify ownership
      const isOwner = await checkOwnership();
      if (!isOwner) {
        router.replace('/');
        return [];
      }
      
      try {
        // Use type assertion to bypass TypeScript errors
        // @ts-ignore - We know bar_images exists in the database
        const { data: imageData, error } = await supabase
          .from('bar_images')
          .select('*')
          .eq('bar_id', barIdString)
          .order('display_order', { ascending: true });
        
        if (error) throw error;
        if (!imageData) return [];

        // Get public URLs for each image
        const imagesWithUrls = await Promise.all(
          imageData.map(async (image: any) => {
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
        console.error('Error fetching images:', error);
        throw error;
      }
    },
    enabled: !!barIdString
  });

  // Delete image mutation
  const deleteImageMutation = useMutation({
    mutationFn: async (imageId: string) => {
      setActionInProgress({ id: imageId, type: 'delete' });
      
      try {
        const imageToDelete = images?.find(img => img.id === imageId);
        if (!imageToDelete) throw new Error('Image not found');

        // Delete from storage first
        const { error: storageError } = await supabase
          .storage
          .from('bar-images')
          .remove([imageToDelete.file_path]);
        
        if (storageError) throw storageError;

        // Then delete from database
        // @ts-ignore - We know bar_images exists in the database
        const { error: dbError } = await supabase
          .from('bar_images')
          .delete()
          .eq('id', imageId);
        
        if (dbError) throw dbError;

        return imageId;
      } catch (error) {
        console.error('Error deleting image:', error);
        throw error;
      } finally {
        setActionInProgress(null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barImages', barIdString] });
      Toast.show({
        type: 'success',
        text1: 'Image deleted successfully'
      });
    },
    onError: (error) => {
      console.error('Delete image error:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to delete image',
        text2: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Set primary image mutation
  const setPrimaryMutation = useMutation({
    mutationFn: async (imageId: string) => {
      setActionInProgress({ id: imageId, type: 'primary' });
      
      try {
        // First reset any existing primary image
        // @ts-ignore - We know bar_images exists in the database
        const { error: resetError } = await supabase
          .from('bar_images')
          .update({ is_primary: false })
          .eq('bar_id', barIdString);
        
        if (resetError) throw resetError;

        // Then set the new primary
        // @ts-ignore - We know bar_images exists in the database
        const { error: updateError } = await supabase
          .from('bar_images')
          .update({ is_primary: true })
          .eq('id', imageId);
        
        if (updateError) throw updateError;

        return imageId;
      } catch (error) {
        console.error('Error setting primary image:', error);
        throw error;
      } finally {
        setActionInProgress(null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barImages', barIdString] });
      Toast.show({
        type: 'success',
        text1: 'Primary image updated'
      });
    },
    onError: (error) => {
      console.error('Set primary image error:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to update primary image',
        text2: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Upload image function
  const uploadImage = useCallback(async (base64Image: string, fileName: string) => {
    setIsUploading(true);
    setUploadProgress(10);
    
    try {
      // Prepare the file data
      const fileExt = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${barIdString}/${uuid.v4()}.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

      setUploadProgress(30);
      
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase
        .storage
        .from('bar-images')
        .upload(filePath, decode(base64Image), {
          contentType,
          upsert: false
        });
      
      if (uploadError) throw uploadError;
      
      setUploadProgress(60);

      // Add record to database
      // @ts-ignore - We know bar_images exists in the database
      const { error: dbError } = await supabase
        .from('bar_images')
        .insert({
          bar_id: barIdString,
          file_path: filePath,
          // Set as primary if it's the first image
          is_primary: images?.length === 0 ? true : false,
          display_order: images?.length || 0
        });
      
      if (dbError) throw dbError;
      
      setUploadProgress(100);

      // Refresh the image list
      queryClient.invalidateQueries({ queryKey: ['barImages', barIdString] });
      Toast.show({
        type: 'success',
        text1: 'Image uploaded successfully'
      });
    } catch (error) {
      console.error('Upload error:', error);
      Toast.show({
        type: 'error',
        text1: 'Upload failed',
        text2: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [barIdString, images?.length, queryClient]);

  // Image picker function
  const pickImage = useCallback(async () => {
    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'We need camera roll permissions to upload images');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (!asset.base64) {
          Toast.show({
            type: 'error',
            text1: 'Image data missing',
            text2: 'Could not process the selected image'
          });
          return;
        }

        const fileName = asset.uri.split('/').pop() || 'image.jpg';
        await uploadImage(asset.base64, fileName);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to pick image',
        text2: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [uploadImage]);

  // Camera function
  const takePhoto = useCallback(async () => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'We need camera permissions to take photos');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (!asset.base64) {
          Toast.show({
            type: 'error',
            text1: 'Image data missing',
            text2: 'Could not process the captured image'
          });
          return;
        }

        const fileName = 'camera_image.jpg';
        await uploadImage(asset.base64, fileName);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to take photo',
        text2: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [uploadImage]);

  // Confirm delete
  const confirmDelete = useCallback((imageId: string) => {
    Alert.alert(
      'Delete Image',
      'Are you sure you want to delete this image? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => deleteImageMutation.mutate(imageId)
        }
      ]
    );
  }, [deleteImageMutation]);

  // Confirm set as primary
  const confirmSetPrimary = useCallback((imageId: string) => {
    Alert.alert(
      'Set as Primary Image',
      'This image will be shown as the main image for your bar. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Set as Primary', 
          onPress: () => setPrimaryMutation.mutate(imageId)
        }
      ]
    );
  }, [setPrimaryMutation]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-gray-900">
        <ActivityIndicator size="large" color="#0284c7" />
        <Text className="mt-4 text-gray-700 dark:text-gray-300">Loading images...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-gray-900">
        <Text className="text-red-500">Error loading images</Text>
        <Text className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          {error instanceof Error ? error.message : 'Unknown error occurred'}
        </Text>
        <Pressable 
          className="mt-4 p-3 rounded-lg bg-sky-600"
          onPress={() => refetch()}
        >
          <Text className="text-white font-medium">Try Again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-900">
      <ScrollView className="flex-1">
        <View className="p-4">
          <Text className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">
            Bar Images
          </Text>
          
          {/* Upload buttons */}
          <View className="flex-row mb-2 space-x-3">
            <Pressable 
              className="flex-1 bg-sky-600 p-4 rounded-lg flex-row items-center justify-center"
              onPress={pickImage}
              disabled={isUploading}
            >
              <UploadCloud size={20} color="white" />
              <Text className="ml-2 text-white font-medium">
                {isUploading ? 'Uploading...' : 'Upload Image'}
              </Text>
            </Pressable>
            
            <Pressable 
              className="flex-1 bg-emerald-600 p-4 rounded-lg flex-row items-center justify-center"
              onPress={takePhoto}
              disabled={isUploading}
            >
              <ImageIcon size={20} color="white" />
              <Text className="ml-2 text-white font-medium">
                Take Photo
              </Text>
            </Pressable>
          </View>
          
          {/* Upload progress bar */}
          {isUploading && (
            <View className="mb-6 mt-2">
              <View className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <View 
                  className="h-full bg-sky-600" 
                  style={{ width: `${uploadProgress}%` }} 
                />
              </View>
              <Text className="text-sm text-gray-600 dark:text-gray-400 mt-1 text-center">
                {uploadProgress < 100 ? `Uploading: ${uploadProgress}%` : 'Processing...'}
              </Text>
            </View>
          )}

          {/* Image grid */}
          {images && images.length > 0 ? (
            <View className="flex-row flex-wrap -mx-2">
              {images.map(image => (
                <View key={image.id} className="w-1/2 p-2">
                  <View className={`rounded-lg overflow-hidden border-2 ${image.is_primary ? 'border-yellow-500' : 'border-gray-200 dark:border-gray-700'}`}>
                    <Image 
                      source={{ uri: image.url }}
                      className="w-full h-48"
                      resizeMode="cover"
                    />
                    <View className="p-2 flex-row justify-between bg-white dark:bg-gray-800">
                      <Pressable
                        className="p-2"
                        onPress={() => confirmSetPrimary(image.id)}
                        disabled={actionInProgress !== null}
                      >
                        {actionInProgress?.id === image.id && actionInProgress?.type === 'primary' ? (
                          <ActivityIndicator size="small" color={isDark ? "#e5e7eb" : "#6b7280"} />
                        ) : (
                          <Star 
                            size={22} 
                            color={image.is_primary ? "#eab308" : (isDark ? "#e5e7eb" : "#6b7280")}
                            fill={image.is_primary ? "#eab308" : "none"}
                          />
                        )}
                      </Pressable>

                      <Pressable
                        className="p-2"
                        onPress={() => confirmDelete(image.id)}
                        disabled={actionInProgress !== null}
                      >
                        {actionInProgress?.id === image.id && actionInProgress?.type === 'delete' ? (
                          <ActivityIndicator size="small" color={isDark ? "#e5e7eb" : "#6b7280"} />
                        ) : (
                          <Trash2 size={22} color={isDark ? "#e5e7eb" : "#6b7280"} />
                        )}
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View className="items-center justify-center p-8 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <ImageIcon size={48} color={isDark ? "#9ca3af" : "#6b7280"} />
              <Text className="mt-4 text-gray-600 dark:text-gray-300 text-center">
                No images yet. Upload images to showcase your bar.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}