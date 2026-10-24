import 'package:user/features/saved_places/widgets/saved_place_editor.dart';

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
    if (!mounted) return;
    setState(() {
      _places = _repository.savedPlaces();
    });
    await _places;
  }

  Future<void> _edit([Map<String, dynamic>? current]) async {
    final input = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) =>
          SavedPlaceEditor(initial: current, repository: _repository),
    );
    if (!mounted) return;
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
        if (snapshot.hasError) {
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: _reload,
          );
        }
        if (!snapshot.hasData) {
          return const Center(
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primaryGreen,
            ),
          );
        }
        if (snapshot.data!.isEmpty) {
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
        }
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
}
