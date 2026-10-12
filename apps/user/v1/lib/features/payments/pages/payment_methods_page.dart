import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class PaymentMethodsPage extends StatefulWidget {
  const PaymentMethodsPage({super.key});
  @override
  State<PaymentMethodsPage> createState() => _PaymentMethodsPageState();
}

class _PaymentMethodsPageState extends State<PaymentMethodsPage> {
  final UserAppRepository _repository = UserAppRepository();
  late Future<List<Map<String, dynamic>>> _methods = _repository
      .paymentMethods();
  Future<void> _reload() async {
    setState(() => _methods = _repository.paymentMethods());
    await _methods;
  }

  Future<void> _add() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text(UserAppCopy.ADD),
        content: const Text(UserAppCopy.PAYMENT_METHOD_NOTICE),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text(UserAppCopy.CANCEL),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text(UserAppCopy.CASH),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _repository.addPaymentMethod({'type': 'CASH', 'is_default': true});
      await _reload();
    } catch (error) {
      if (mounted) _error(error);
    }
  }

  Future<void> _delete(String id) async {
    try {
      await _repository.deletePaymentMethod(id);
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
    title: UserAppCopy.PAYMENT_METHODS,
    action: IconButton(
      onPressed: _add,
      icon: const Icon(Icons.add, color: AppColors.primaryGreen),
    ),
    scrollable: true,
    child: FutureBuilder<List<Map<String, dynamic>>>(
      future: _methods,
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
                  icon: Icons.credit_card_outlined,
                  title: UserAppCopy.EMPTY_PAYMENTS,
                  subtitle: UserAppCopy.EMPTY_PAYMENTS_DESCRIPTION,
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
              final method = snapshot.data![index];
              final type = '${method['type'] ?? ''}';
              final label = type == 'CARD'
                  ? '${method['card_brand'] ?? 'Card'} •••• ${method['card_last4'] ?? ''}'
                  : type == 'UPI'
                  ? '${method['upi_handle'] ?? 'UPI'}'
                  : type;
              return AppCard(
                child: Row(
                  children: [
                    Icon(
                      type == 'CASH'
                          ? Icons.payments_outlined
                          : Icons.credit_card,
                      size: 23.w,
                      color: AppColors.primaryGreen,
                    ),
                    SizedBox(width: 12.w),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            label,
                            style: TextStyle(
                              fontSize: 14.sp,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          if (method['is_default'] == true)
                            Text(
                              'DEFAULT',
                              style: TextStyle(
                                fontSize: 10.sp,
                                color: AppColors.primaryGreen,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => _delete('${method['id']}'),
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
