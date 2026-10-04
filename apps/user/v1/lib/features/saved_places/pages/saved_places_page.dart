import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SavedPlacesPage extends StatefulWidget {
  const SavedPlacesPage({super.key});
  @override
  State<SavedPlacesPage> createState() => _SavedPlacesPageState();
}

class _SavedPlacesPageState extends State<SavedPlacesPage> {
  final UserAppRepository _repository = UserAppRepository();
  late Future<List<Map<String, dynamic>>> _places = _repository.savedPlaces();
  Future<void> _reload() async {
    setState(() => _places = _repository.savedPlaces());
    await _places;
  }

  Future<void> _edit([Map<String, dynamic>? current]) async {
    final label = TextEditingController(text: '${current?['label'] ?? ''}');
    final address = TextEditingController(text: '${current?['address'] ?? ''}');
    List<Map<String, dynamic>> suggestions = [];
    double? selectedLatitude = (current?['latitude'] as num?)?.toDouble();
    double? selectedLongitude = (current?['longitude'] as num?)?.toDouble();
    bool searching = false;
    String placeType = '${current?['place_type'] ?? 'OTHER'}';
    Timer? debounce;
    final input = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: Text(current == null ? UserAppCopy.ADD : UserAppCopy.EDIT),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _input(label, UserAppCopy.PLACE_LABEL),
                DropdownButtonFormField<String>(
                  initialValue: placeType,
                  decoration: InputDecoration(
                    labelText: UserAppCopy.PLACE_TYPE,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12.r),
                    ),
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'HOME',
                      child: Text(UserAppCopy.HOME),
                    ),
                    DropdownMenuItem(
                      value: 'WORK',
                      child: Text(UserAppCopy.WORK),
                    ),
                    DropdownMenuItem(
                      value: 'OTHER',
                      child: Text(UserAppCopy.OTHER),
                    ),
                  ],
                  onChanged: (value) =>
                      update(() => placeType = value ?? 'OTHER'),
                ),
                SizedBox(height: 10.h),
                TextField(
                  controller: address,
                  decoration: InputDecoration(
                    labelText: UserAppCopy.ADDRESS,
                    hintText: UserAppCopy.CHOOSE_ADDRESS,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12.r),
                    ),
                  ),
                  onChanged: (value) {
                    debounce?.cancel();
                    if (value.trim().length < 3) {
                      update(() {
                        suggestions = [];
                        searching = false;
                        selectedLatitude = null;
                        selectedLongitude = null;
                      });
                      return;
                    }
                    debounce = Timer(
                      const Duration(milliseconds: 450),
                      () async {
                        update(() => searching = true);
                        try {
                          final results = await _repository.searchPlaces(
                            value.trim(),
                          );
                          if (context.mounted)
                            update(() {
                              suggestions = results;
                              searching = false;
                            });
                        } catch (_) {
                          if (context.mounted)
                            update(() {
                              suggestions = [];
                              searching = false;
                            });
                        }
                      },
                    );
                  },
                ),
                if (searching)
                  Padding(
                    padding: EdgeInsets.all(12.h),
                    child: SizedBox(
                      width: 18.w,
                      height: 18.w,
                      child: const CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                if (suggestions.isNotEmpty)
                  SizedBox(
                    height: 180.h,
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: suggestions.length,
                      itemBuilder: (context, index) {
                        final item = suggestions[index];
                        return ListTile(
                          dense: true,
                          leading: const Icon(
                            Icons.place_outlined,
                            color: AppColors.primaryGreen,
                          ),
                          title: Text(
                            '${item['display_name'] ?? ''}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          onTap: () {
                            selectedLatitude = double.tryParse(
                              '${item['lat']}',
                            );
                            selectedLongitude = double.tryParse(
                              '${item['lon']}',
                            );
                            address.text = '${item['display_name'] ?? ''}';
                            update(() => suggestions = []);
                            FocusScope.of(context).unfocus();
                          },
                        );
                      },
                    ),
                  ),
                if (selectedLatitude == null)
                  Padding(
                    padding: EdgeInsets.only(top: 8.h),
                    child: Text(
                      UserAppCopy.SELECT_ADDRESS,
                      style: TextStyle(
                        fontSize: 11.sp,
                        color: AppColors.textTertiary,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text(UserAppCopy.CANCEL),
            ),
            TextButton(
              onPressed: () {
                if (label.text.trim().isEmpty ||
                    selectedLatitude == null ||
                    selectedLongitude == null)
                  return;
                Navigator.pop(dialogContext, {
                  'label': label.text.trim(),
                  'address': address.text.trim(),
                  'latitude': selectedLatitude,
                  'longitude': selectedLongitude,
                  'place_type': placeType,
                });
              },
              child: Text(
                current == null ? UserAppCopy.ADD : UserAppCopy.SAVE_CHANGES,
              ),
            ),
          ],
        ),
      ),
    );
    debounce?.cancel();
    label.dispose();
    address.dispose();
    if (input == null) return;
    try {
      if (current == null) {
        await _repository.addSavedPlace(input);
      } else {
        await _repository.updateSavedPlace('${current['id']}', input);
      }
      if (mounted) await _reload();
    } catch (error) {
      if (mounted) _showError(error);
    }
  }

  Future<void> _delete(String id) async {
    try {
      await _repository.deleteSavedPlace(id);
      await _reload();
    } catch (error) {
      if (mounted) _showError(error);
    }
  }

  void _showError(Object error) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.SAVED_PLACES,
    action: IconButton(
      onPressed: () => _edit(),
      icon: const Icon(Icons.add, color: AppColors.primaryGreen),
    ),
    scrollable: true,
    child: FutureBuilder<List<Map<String, dynamic>>>(
      future: _places,
      builder: (context, snapshot) {
        if (snapshot.hasError)
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: _reload,
          );
        if (!snapshot.hasData)
          return const Center(
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primaryGreen,
            ),
          );
        if (snapshot.data!.isEmpty)
          return RefreshIndicator(
            onRefresh: _reload,
            color: AppColors.primaryGreen,
            child: ListView(
              children: [
                SizedBox(height: 140.h),
                const AppEmptyState(
                  icon: Icons.bookmark_border,
                  title: UserAppCopy.EMPTY_PLACES,
                  subtitle: UserAppCopy.EMPTY_PLACES_DESCRIPTION,
                ),
              ],
            ),
          );
        return RefreshIndicator(
          color: AppColors.primaryGreen,
          onRefresh: _reload,
          child: ListView.separated(
            padding: EdgeInsets.fromLTRB(16.w, 4.h, 16.w, 24.h),
            itemCount: snapshot.data!.length,
            separatorBuilder: (_, _) => SizedBox(height: 10.h),
            itemBuilder: (context, index) {
              final place = snapshot.data![index];
              return AppCard(
                child: Row(
                  children: [
                    Container(
                      width: 42.w,
                      height: 42.w,
                      decoration: const BoxDecoration(
                        color: AppColors.softGrey,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.place_outlined,
                        size: 20.w,
                        color: AppColors.primaryGreen,
                      ),
                    ),
                    SizedBox(width: 12.w),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${place['label'] ?? ''}',
                            style: TextStyle(
                              fontSize: 15.sp,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          SizedBox(height: 4.h),
                          Text(
                            '${place['address'] ?? ''}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12.sp,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => _edit(place),
                      icon: const Icon(
                        Icons.edit_outlined,
                        color: AppColors.primaryGreen,
                      ),
                    ),
                    IconButton(
                      onPressed: () => _delete('${place['id']}'),
                      icon: const Icon(
                        Icons.delete_outline,
                        color: AppColors.textTertiary,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    ),
  );

  Widget _input(
    TextEditingController controller,
    String label, {
    TextInputType? keyboard,
  }) => Padding(
    padding: EdgeInsets.only(bottom: 10.h),
    child: TextField(
      controller: controller,
      keyboardType: keyboard,
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12.r)),
      ),
    ),
  );
}
