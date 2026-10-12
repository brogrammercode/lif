import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SupportTicketPage extends StatefulWidget {
  const SupportTicketPage({super.key});
  @override
  State<SupportTicketPage> createState() => _SupportTicketPageState();
}

class _SupportTicketPageState extends State<SupportTicketPage> {
  final UserAppRepository _repository = UserAppRepository();
  final TextEditingController _message = TextEditingController();
  late Future<Map<String, dynamic>> _ticket;
  late String _ticketId;
  bool _initialized = false;
  bool _sending = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _ticketId = ModalRoute.of(context)?.settings.arguments as String? ?? '';
    _ticket = _repository.supportTicket(_ticketId);
    _initialized = true;
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_message.text.trim().isEmpty) return;
    setState(() => _sending = true);
    try {
      await _repository.sendSupportMessage(_ticketId, _message.text.trim());
      _message.clear();
      setState(() => _ticket = _repository.supportTicket(_ticketId));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.SUPPORT,
    scrollable: true,
    child: FutureBuilder<Map<String, dynamic>>(
      future: _ticket,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: () =>
                setState(() => _ticket = _repository.supportTicket(_ticketId)),
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
        final ticket = snapshot.data!;
        final messages = List<Map<String, dynamic>>.from(
          (ticket['messages'] as List? ?? []).map(
            (value) => Map<String, dynamic>.from(value as Map),
          ),
        );
        return Column(
          children: [
            Expanded(
              child: ListView(
                padding: EdgeInsets.only(bottom: 12.h),
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${ticket['subject'] ?? ''}',
                          style: TextStyle(
                            fontSize: 17.sp,
                            fontWeight: FontWeight.w900,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        SizedBox(height: 5.h),
                        Text(
                          '${ticket['status'] ?? ''}',
                          style: TextStyle(
                            fontSize: 12.sp,
                            color: AppColors.primaryGreen,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: 12.h),
                  ...messages.map(
                    (message) => Padding(
                      padding: EdgeInsets.only(bottom: 10.h),
                      child: AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${message['body'] ?? ''}',
                              style: TextStyle(
                                fontSize: 13.sp,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            SizedBox(height: 6.h),
                            Text(
                              _date(message['created_at']),
                              style: TextStyle(
                                fontSize: 10.sp,
                                color: AppColors.textTertiary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: EdgeInsets.only(bottom: 8.h),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _message,
                        minLines: 1,
                        maxLines: 4,
                        decoration: InputDecoration(
                          hintText: UserAppCopy.MESSAGE,
                          filled: true,
                          fillColor: AppColors.pureWhite,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16.r),
                            borderSide: const BorderSide(
                              color: AppColors.borderGrey,
                            ),
                          ),
                        ),
                      ),
                    ),
                    SizedBox(width: 8.w),
                    IconButton(
                      onPressed: _sending ? null : _send,
                      icon: _sending
                          ? SizedBox(
                              width: 20.w,
                              height: 20.w,
                              child: const CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(
                              Icons.send_rounded,
                              color: AppColors.primaryGreen,
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    ),
  );

  String _date(dynamic value) {
    final date = DateTime.tryParse('$value');
    return date == null ? '' : '${date.day}/${date.month}/${date.year}';
  }
}
