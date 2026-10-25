import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';

class TripActionsPanel extends StatefulWidget {
  final String rideId;
  final Map<String, dynamic>? externalContext;
  final Future<void> Function() onChanged;
  final Future<void> Function()? confirmRider;
  final Future<void> Function()? cancelRide;
  final DriverOperationsRepository? repository;
  const TripActionsPanel({
    super.key,
    required this.rideId,
    required this.onChanged,
    this.externalContext,
    this.confirmRider,
    this.cancelRide,
    this.repository,
  });
  @override
  State<TripActionsPanel> createState() => _TripActionsPanelState();
}

class _TripActionsPanelState extends State<TripActionsPanel> {
  late final _repo = widget.repository ?? DriverOperationsRepository();
  final _code = TextEditingController();
  Map<String, dynamic>? _data;
  Timer? _poll;
  Completer<void>? _readDone;
  String? _error;
  bool _busy = false, _reading = false;
  String? _method;
  @override
  void initState() {
    super.initState();
    if (widget.externalContext == null) {
      unawaited(_load());
      _poll = Timer.periodic(const Duration(seconds: 5), (_) {
        if (!_busy &&
            ModalRoute.of(context)?.isCurrent == true &&
            WidgetsBinding.instance.lifecycleState ==
                AppLifecycleState.resumed) {
          unawaited(_load());
        }
      });
    }
  }

  Future<void> _load() async {
    if (_reading || !mounted) return;
    _reading = true;
    final done = _readDone = Completer<void>();
    try {
      final data = await _repo.context(widget.rideId);
      if (mounted) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      _reading = false;
      done.complete();
      _readDone = null;
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _readDone?.future;
      if (!mounted) return;
      await action();
      if (!mounted) return;
      if (widget.externalContext == null) await _load();
      await widget.onChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _reason(String title) async {
    final input = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: input,
          minLines: 2,
          maxLines: 5,
          maxLength: 1000,
          decoration: const InputDecoration(
            labelText: 'Reason (at least 5 characters)',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              if (input.text.trim().length >= 5) {
                Navigator.pop(ctx, input.text.trim());
              }
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    input.dispose();
    return value;
  }

  Future<void> _call() async {
    await _run(() async {
      final phone = await _repo.contact(widget.rideId);
      if (!mounted) return;
      if (!await launchUrl(Uri(scheme: 'tel', path: phone))) {
        throw StateError(
          'Calling could not be opened. Use trip chat or Support.',
        );
      }
    });
  }

  Future<void> _payUpi() async {
    await _run(() async {
      final data = await _repo.payment(widget.rideId, 'UPI');
      if (!mounted) return;
      final payment = data['payment'] as Map? ?? {};
      if (!['PENDING', 'FAILED'].contains(payment['status'])) {
        throw StateError(
          'This payment has already changed. Refresh the ride and check its receipt before paying.',
        );
      }
      final handle = payment['recipient_upi'];
      if (handle == null) {
        throw StateError('No approved driver UPI is available.');
      }
      final uri = Uri(
        scheme: 'upi',
        host: 'pay',
        queryParameters: {
          'pa': '$handle',
          'pn': '1More driver',
          'am': '${payment['amount']}',
          'cu': 'INR',
          'tn': 'Ride ${widget.rideId}',
        },
      );
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw StateError(
          'No UPI app could be opened. Payment remains pending.',
        );
      }
    });
  }

  Future<void> _payReviewedCharge() async {
    await _run(() async {
      // Read the approved obligation again before opening a payment app.
      final data = await _repo.context(widget.rideId);
      if (!mounted) return;
      final review = data['review'] as Map?;
      final handle = data['review_payment_upi'];
      if (review?['status'] != 'APPROVED' || handle == null) {
        throw StateError(
          'This charge has changed. Refresh the trip before paying.',
        );
      }
      final uri = Uri(
        scheme: 'upi',
        host: 'pay',
        queryParameters: {
          'pa': '$handle',
          'pn': '1More driver',
          'am': '${review!['fee_amount']}',
          'cu': 'INR',
          'tn': 'Reviewed trip charge ${widget.rideId}',
        },
      );
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw StateError(
          'No UPI app could be opened. The charge remains pending.',
        );
      }
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.externalContext ?? _data;
    if (data == null) {
      return AppCard(
        child: _error != null
            ? TextButton(onPressed: _load, child: Text('$_error · Retry'))
            : const LinearProgressIndicator(),
      );
    }
    final status = '${data['status']}';
    final driver = data['is_driver'] == true;
    final active = [
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVING',
      'DRIVER_WAITING',
      'IN_PROGRESS',
    ].contains(status);
    final start = data['start'] as Map? ?? {};
    final payment = data['payment'] as Map? ?? {};
    final paymentStatus = payment['status'];
    final collectionLocked =
        data['direct_collection_allowed'] == false ||
        ![null, 'PENDING', 'FAILED'].contains(paymentStatus);
    final options = data['payment_options'] as Map? ?? {};
    final review = data['review'] as Map?;
    final noShowAfter = DateTime.tryParse('${data['no_show_after']}');
    final canReportNoShow =
        noShowAfter != null &&
        !noShowAfter.isAfter(DateTime.now()) &&
        data['no_show_contact_attempted'] == true;
    final allowed = [
      if (options['cash'] == true) 'CASH',
      if (options['upi'] == true) 'UPI',
    ];
    final preferred =
        _method ?? payment['method'] ?? data['collection_preference'] ?? 'CASH';
    final selected = allowed.contains(preferred)
        ? '$preferred'
        : (allowed.isEmpty ? 'CASH' : allowed.first);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null)
            TextButton(onPressed: _load, child: Text('$_error · Retry')),
          if (status == 'SEARCHING')
            Text(
              'Searching for drivers${data['search_radius_km'] == null ? '' : ' within ${data['search_radius_km']} km'}. The search expands while no driver accepts.',
            ),
          if (active && data['driver_location_fresh'] == false)
            Text(
              driver
                  ? 'Your precise GPS has not reached the server recently. Refresh location and check permissions before continuing.'
                  : 'Driver location has not updated recently. Contact the driver or Support.',
            ),
          if (active)
            Wrap(
              spacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: _busy ? null : _call,
                  icon: const Icon(Icons.phone_outlined),
                  label: const Text('Call'),
                ),
                OutlinedButton.icon(
                  onPressed: () => Navigator.pushNamed(
                    context,
                    AppRoutes.tripChat,
                    arguments: widget.rideId,
                  ),
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: const Text('Chat'),
                ),
                TextButton(
                  onPressed: () =>
                      Navigator.pushNamed(context, AppRoutes.support),
                  child: const Text('Help'),
                ),
              ],
            ),
          if (status == 'DRIVER_WAITING') ...[
            const SizedBox(height: 10),
            Text(
              driver ? 'Start verification' : 'Your trip start code',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
            ),
            if (!driver && start['code'] != null)
              SelectableText(
                '${start['code']}',
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 7,
                ),
              ),
            Text(
              driver
                  ? 'Ask the rider for the trip code after they confirm the driver and vehicle. Partner activation codes are separate.'
                  : 'Confirm the correct driver and vehicle before sharing this code. Both rider confirmation and driver code verification are required.',
            ),
            Text(
              'Rider confirmation: ${start['rider_confirmed'] == true ? 'Done' : 'Waiting'} · Driver code: ${start['driver_verified'] == true ? 'Done' : 'Waiting'}',
            ),
            if (driver && start['driver_verified'] != true) ...[
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                decoration: const InputDecoration(
                  labelText: 'Six-digit code from rider',
                ),
              ),
              FilledButton(
                onPressed: _busy
                    ? null
                    : () => _run(() async {
                        if (_code.text.length != 6) {
                          throw StateError('Enter all six digits.');
                        }
                        await _repo.start(widget.rideId, _code.text);
                        _code.clear();
                      }),
                child: const Text('Verify trip code'),
              ),
            ],
            if (!driver &&
                start['code'] != null &&
                start['rider_confirmed'] != true)
              FilledButton(
                onPressed: _busy
                    ? null
                    : () => _run(() async {
                        if (widget.confirmRider != null) {
                          await widget.confirmRider!();
                        }
                      }),
                child: const Text('Confirm pickup and driver'),
              ),
            if (!driver && start['code'] == null)
              OutlinedButton(
                onPressed: _busy
                    ? null
                    : () => _run(() => _repo.refreshCode(widget.rideId)),
                child: Text(
                  start['locked'] == true
                      ? 'Code locked · refresh after expiry'
                      : 'Request a fresh trip code',
                ),
              ),
          ],
          if (status == 'COMPLETED') ...[
            Text(
              switch (paymentStatus) {
                'CAPTURED' => 'Payment received',
                'CANCELLED' => 'Fare waived',
                'REFUNDED' => 'Payment refunded',
                'PARTIALLY_REFUNDED' => 'Payment partially refunded',
                'AUTHORIZED' => 'Payment awaiting provider settlement',
                'REQUIRES_ACTION' => 'Payment requires action',
                _ => 'Payment pending',
              },
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 17,
                color: payment['status'] == 'CAPTURED'
                    ? AppColors.primaryGreen
                    : AppColors.textPrimary,
              ),
            ),
            if ([
                  'AUTHORIZED',
                  'REQUIRES_ACTION',
                  'REFUNDED',
                  'PARTIALLY_REFUNDED',
                ].contains(paymentStatus) ||
                (data['direct_collection_allowed'] == false &&
                    ['PENDING', 'FAILED'].contains(paymentStatus)))
              const Text(
                'This payment is already managed or resolved. Contact Support for any payment concern.',
              ),
            if (!collectionLocked) ...[
              const Text(
                'Pay the driver directly after the ride. Opening a UPI app does not confirm payment.',
              ),
              if (driver && allowed.isNotEmpty) ...[
                DropdownButtonFormField<String>(
                  key: ValueKey(selected),
                  initialValue: selected,
                  decoration: const InputDecoration(
                    labelText: 'Collection method',
                  ),
                  items: allowed
                      .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                      .toList(),
                  onChanged: _busy
                      ? null
                      : (v) => setState(() => _method = v ?? 'CASH'),
                ),
                FilledButton(
                  onPressed: _busy
                      ? null
                      : () => _run(() async {
                          final confirmed = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: const Text('Confirm full fare received?'),
                              content: const Text(
                                'Confirm only after you have received the complete displayed fare. A rider screenshot alone is not proof of UPI receipt.',
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(ctx, false),
                                  child: const Text('Not yet'),
                                ),
                                TextButton(
                                  onPressed: () => Navigator.pop(ctx, true),
                                  child: const Text('Received'),
                                ),
                              ],
                            ),
                          );
                          if (confirmed == true) {
                            await _repo.collection(
                              widget.rideId,
                              selected,
                              true,
                              null,
                            );
                          }
                        }),
                  child: const Text('Confirm full fare received'),
                ),
                OutlinedButton(
                  onPressed: _busy
                      ? null
                      : () => _run(() async {
                          final reason = await _reason('Report unpaid fare');
                          if (reason != null) {
                            await _repo.collection(
                              widget.rideId,
                              selected,
                              false,
                              reason,
                            );
                          }
                        }),
                  child: const Text('Report unpaid fare'),
                ),
              ],
              if (!driver) ...[
                if (options['cash'] == true)
                  OutlinedButton(
                    onPressed: _busy
                        ? null
                        : () => _run(() async {
                            await _repo.payment(widget.rideId, 'CASH');
                          }),
                    child: const Text('Pay driver in cash'),
                  ),
                if (options['upi'] == true)
                  FilledButton(
                    onPressed: _busy ? null : _payUpi,
                    child: const Text('Pay driver via UPI'),
                  ),
              ],
              if (allowed.isEmpty)
                const Text(
                  'No supported collection method is available. Contact Support.',
                ),
            ],
          ],
          if (active && status != 'IN_PROGRESS') ...[
            TextButton(
              onPressed: _busy
                  ? null
                  : () => _run(() async {
                      if (!driver && widget.cancelRide != null) {
                        await widget.cancelRide!();
                        return;
                      }
                      final reason = await _reason('Cancel this ride');
                      if (reason != null) {
                        await _repo.issue(
                          widget.rideId,
                          'CANCELLATION',
                          reason,
                        );
                      }
                    }),
              child: const Text('Cancel ride and provide reason'),
            ),
            if (driver && status == 'DRIVER_WAITING')
              TextButton(
                onPressed: _busy || !canReportNoShow
                    ? null
                    : () => _run(() async {
                        final reason = await _reason(
                          'Report passenger no-show',
                        );
                        if (reason != null) {
                          await _repo.issue(widget.rideId, 'NO_SHOW', reason);
                        }
                      }),
                child: const Text('Report passenger no-show'),
              ),
            if (driver && status == 'DRIVER_WAITING' && !canReportNoShow)
              const Text(
                'Wait for the free pickup period to end and try calling the passenger before reporting a no-show. Stay at pickup with precise GPS. If calling is unavailable, contact Support.',
              ),
          ],
          if (review != null) ...[
            const Divider(),
            Text(
              'Trip review · ${review['status']}',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            Text('${review['kind']} · INR ${review['fee_amount']}'),
            Text('${review['reason']}'),
            const Text(
              'Proposed fees require review. They are never added to your next ride or collected by another driver.',
            ),
            if (review['resolution_note'] != null)
              Text('${review['resolution_note']}'),
            if (!driver &&
                review['status'] == 'APPROVED' &&
                data['review_payment_upi'] != null) ...[
              OutlinedButton(
                onPressed: _busy ? null : _payReviewedCharge,
                child: const Text('Pay reviewed charge to driver via UPI'),
              ),
              const Text(
                'Opening UPI does not confirm payment. Ask Support to verify receipt and record settlement.',
              ),
            ],
            if ([
              'REQUESTED',
              'APPROVED',
              'DISPUTED',
            ].contains(review['status']))
              TextButton(
                onPressed: _busy
                    ? null
                    : () => _run(() async {
                        final reason = await _reason('Dispute this review');
                        if (reason != null) {
                          await _repo.dispute(widget.rideId, reason);
                        }
                      }),
                child: const Text('Dispute charge'),
              ),
          ],
          if (_busy) const LinearProgressIndicator(),
        ],
      ),
    );
  }
}
