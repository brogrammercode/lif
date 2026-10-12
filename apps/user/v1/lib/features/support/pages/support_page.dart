import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SupportPage extends StatefulWidget {
  const SupportPage({super.key});
  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  final UserAppRepository _repository = UserAppRepository();
  late Future<List<Map<String, dynamic>>> _tickets = _repository
      .supportTickets();
  Future<void> _reload() async {
    setState(() => _tickets = _repository.supportTickets());
    await _tickets;
  }

  Future<void> _createTicket() async {
    final subject = TextEditingController();
    final body = TextEditingController();
    final input = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text(UserAppCopy.NEW_SUPPORT_REQUEST),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: subject,
              decoration: const InputDecoration(labelText: UserAppCopy.SUBJECT),
            ),
            SizedBox(height: 12.h),
            TextField(
              controller: body,
              minLines: 3,
              maxLines: 5,
              decoration: const InputDecoration(labelText: UserAppCopy.MESSAGE),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text(UserAppCopy.CANCEL),
          ),
          TextButton(
            onPressed: () {
              if (subject.text.trim().isNotEmpty &&
                  body.text.trim().isNotEmpty) {
                Navigator.pop(dialogContext, {
                  'subject': subject.text.trim(),
                  'body': body.text.trim(),
                  'priority': 'NORMAL',
                });
              }
            },
            child: const Text(UserAppCopy.SEND),
          ),
        ],
      ),
    );
    subject.dispose();
    body.dispose();
    if (input == null) return;
    try {
      await _repository.createSupportTicket(input);
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
    title: UserAppCopy.SUPPORT,
    action: IconButton(
      onPressed: _createTicket,
      icon: const Icon(Icons.add, color: AppColors.primaryGreen),
    ),
    scrollable: true,
    child: FutureBuilder<List<Map<String, dynamic>>>(
      future: _tickets,
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
                  icon: Icons.support_agent,
                  title: UserAppCopy.EMPTY_SUPPORT,
                  subtitle: UserAppCopy.EMPTY_SUPPORT_DESCRIPTION,
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
              final ticket = snapshot.data![index];
              return ListTile(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16.r),
                  side: const BorderSide(color: AppColors.borderGrey),
                ),
                tileColor: AppColors.pureWhite,
                leading: const Icon(
                  Icons.chat_bubble_outline,
                  color: AppColors.primaryGreen,
                ),
                title: Text(
                  '${ticket['subject'] ?? ''}',
                  style: TextStyle(
                    fontSize: 14.sp,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textPrimary,
                  ),
                ),
                subtitle: Padding(
                  padding: EdgeInsets.only(top: 4.h),
                  child: Text(
                    '${ticket['status'] ?? 'OPEN'} · ${_date(ticket['created_at'])}',
                    style: TextStyle(
                      fontSize: 11.sp,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.pushNamed(
                  context,
                  AppRoutes.supportTicket,
                  arguments: ticket['id'],
                ).then((_) => _reload()),
              );
            },
          ),
        );
      },
    ),
  );

  String _date(dynamic value) {
    final date = DateTime.tryParse('$value');
    return date == null ? '' : '${date.day}/${date.month}/${date.year}';
  }
}
