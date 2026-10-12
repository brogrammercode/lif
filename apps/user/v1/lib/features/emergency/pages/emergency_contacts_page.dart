import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class EmergencyContactsPage extends StatefulWidget {
  const EmergencyContactsPage({super.key});
  @override
  State<EmergencyContactsPage> createState() => _EmergencyContactsPageState();
}

class _EmergencyContactsPageState extends State<EmergencyContactsPage> {
  final UserAppRepository _repository = UserAppRepository();
  late Future<List<Map<String, dynamic>>> _contacts = _repository
      .emergencyContacts();
  Future<void> _reload() async {
    setState(() => _contacts = _repository.emergencyContacts());
    await _contacts;
  }

  Future<void> _edit([Map<String, dynamic>? current]) async {
    final name = TextEditingController(text: '${current?['name'] ?? ''}');
    final phone = TextEditingController(
      text: '${current?['phone_e164'] ?? ''}',
    );
    final relationship = TextEditingController(
      text: '${current?['relationship'] ?? ''}',
    );
    final value = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(current == null ? UserAppCopy.ADD : UserAppCopy.EDIT),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _field(name, UserAppCopy.NAME),
            _field(phone, UserAppCopy.PHONE, keyboard: TextInputType.phone),
            _field(relationship, UserAppCopy.RELATIONSHIP),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text(UserAppCopy.CANCEL),
          ),
          TextButton(
            onPressed: () {
              if (name.text.trim().isNotEmpty &&
                  phone.text.trim().startsWith('+')) {
                Navigator.pop(dialogContext, {
                  'name': name.text.trim(),
                  'phone_e164': phone.text.trim(),
                  'relationship': relationship.text.trim(),
                });
              }
            },
            child: Text(
              current == null ? UserAppCopy.ADD : UserAppCopy.SAVE_CHANGES,
            ),
          ),
        ],
      ),
    );
    name.dispose();
    phone.dispose();
    relationship.dispose();
    if (value == null) return;
    try {
      if (current == null) {
        await _repository.addEmergencyContact(value);
      } else {
        await _repository.updateEmergencyContact('${current['id']}', value);
      }
      await _reload();
    } catch (error) {
      if (mounted) _error(error);
    }
  }

  Future<void> _delete(String id) async {
    try {
      await _repository.deleteEmergencyContact(id);
      await _reload();
    } catch (error) {
      if (mounted) _error(error);
    }
  }

  void _error(Object error) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.EMERGENCY_CONTACTS,
    action: IconButton(
      onPressed: () => _edit(),
      icon: const Icon(Icons.add, color: AppColors.primaryGreen),
    ),
    scrollable: true,
    child: FutureBuilder<List<Map<String, dynamic>>>(
      future: _contacts,
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
                  icon: Icons.health_and_safety_outlined,
                  title: UserAppCopy.EMPTY_CONTACTS,
                  subtitle: UserAppCopy.EMPTY_CONTACTS_DESCRIPTION,
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
              final person = snapshot.data![index];
              return AppCard(
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: AppColors.softGrey,
                      child: Icon(
                        Icons.person_outline,
                        color: AppColors.primaryGreen,
                        size: 20.w,
                      ),
                    ),
                    SizedBox(width: 12.w),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${person['name'] ?? ''}',
                            style: TextStyle(
                              fontSize: 15.sp,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          SizedBox(height: 3.h),
                          Text(
                            '${person['phone_e164'] ?? ''} · ${person['relationship'] ?? ''}',
                            style: TextStyle(
                              fontSize: 12.sp,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => _edit(person),
                      icon: const Icon(
                        Icons.edit_outlined,
                        color: AppColors.primaryGreen,
                      ),
                    ),
                    IconButton(
                      onPressed: () => _delete('${person['id']}'),
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

  Widget _field(
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
