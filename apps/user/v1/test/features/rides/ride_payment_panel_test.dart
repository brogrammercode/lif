import 'dart:async';

import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'package:user/features/rides/widgets/ride_payment_panel.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';

class _PaymentRepo extends DriverOperationsRepository {
  _PaymentRepo(this.driver)
    : super(
        client: DioClient.forTesting(
          client: Dio(),
          createRefreshClient: Dio.new,
        ),
      );

  final bool driver;
  String? method;
  String status = 'PENDING';
  int walletPayments = 0;
  int receipts = 0;
  bool upiSupported = false;
  bool checkoutStarted = false;

  Map<String, dynamic> get data => {
    'ride_id': 'ride',
    'status': 'COMPLETED',
    'is_driver': driver,
    'trip': {
      'id': 'ride',
      'status': 'COMPLETED',
      'final_fare': '50.00',
      'pickup_address': 'Station',
      'dropoff_address': 'University',
    },
    'direct_collection_allowed': method != 'WALLET',
    'payment': {
      'status': status,
      'method': method,
      'amount': '50.00',
      'razorpay_checkout': checkoutStarted,
    },
    'payment_options': {
      'cash': true,
      'razorpay_upi': upiSupported,
      'wallet': true,
      'wallet_available_paise': '15000',
    },
  };

  @override
  Future<Map<String, dynamic>> context(String id) async => data;

  @override
  Future<String?> checkoutPhone() async => '+919876543210';

  @override
  Future<Map<String, dynamic>> payment(String id, String selection) async {
    method = selection;
    return data;
  }

  @override
  Future<void> payWithWallet(String id) async {
    expect(method, 'WALLET');
    walletPayments++;
    status = 'CAPTURED';
  }

  @override
  Future<Map<String, dynamic>> rideUpi(String id, {bool open = false}) async {
    if (open) {
      checkoutStarted = true;
      method = 'UPI';
    }
    return {
      'status': status,
      'amount_paise': '15000',
      if (open)
        'sdk_checkout': {
          'key_id': 'rzp_test_fixture',
          'order_id': 'order_ride',
        },
    };
  }

  @override
  Future<void> collection(
    String id,
    String method,
    bool received,
    String? reason,
  ) async {
    expect(method, 'CASH');
    expect(received, isTrue);
    receipts++;
    status = 'CAPTURED';
  }
}

Widget _panel(_PaymentRepo repo, {Future<void> Function()? onChanged}) =>
    MaterialApp(
      home: Scaffold(
        body: RidePaymentPanel(
          rideId: 'ride',
          data: repo.data,
          repository: repo,
          onChanged: onChanged ?? () async {},
        ),
      ),
    );

void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://ride.example.test/api/v2',
    ),
  );

  testWidgets(
    'live rider flow waits for cash confirmation before the receipt',
    (tester) async {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      final repo = _PaymentRepo(false);
      await tester.pumpWidget(
        ScreenUtilInit(
          designSize: const Size(390, 844),
          builder: (_, _) => MaterialApp(
            routes: {'/': (_) => const SizedBox.shrink()},
            onGenerateInitialRoutes: (_) => [
              MaterialPageRoute<void>(
                settings: const RouteSettings(arguments: 'ride'),
                builder: (_) => RideDetailPage(
                  operationsRepository: repo,
                  mapBuilder: (_) => const SizedBox(),
                ),
              ),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Ride payment'), findsOneWidget);
      expect(find.text('UPI'), findsOneWidget);
      expect(find.text('Balance ₹150.00'), findsOneWidget);
      await tester.tap(find.text('Cash'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(repo.method, 'CASH');
      expect(find.text('Payment progress'), findsOneWidget);
      expect(find.text('Waiting for driver verification'), findsWidgets);
      expect(find.text('Continue to receipt'), findsNothing);
      expect(find.byType(RideSwipeButton), findsNothing);
      repo.status = 'CAPTURED';
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      expect(find.text('Payment successful'), findsOneWidget);
      await tester.tap(find.text('Continue to receipt'));
      await tester.pumpAndSettle();
      expect(find.text('Ride payment'), findsNothing);
      expect(find.text("You've arrived"), findsWidgets);
      expect(find.text('Download bill'), findsWidgets);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'an unpaid ride reopened from history offers the same payment flow',
    (tester) async {
      final repo = _PaymentRepo(false);
      await tester.pumpWidget(
        ScreenUtilInit(
          designSize: const Size(390, 844),
          builder: (_, _) => MaterialApp(
            home: RideDetailPage(
              historyRideId: 'ride',
              operationsRepository: repo,
              mapBuilder: (_) => const SizedBox(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byType(RidePaymentPanel),
        140,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.byType(RidePaymentPanel), findsOneWidget);
      expect(find.text('UPI'), findsOneWidget);
      expect(find.text('Balance ₹150.00'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('wallet succeeds inside the sheet before opening the receipt', (
    tester,
  ) async {
    final repo = _PaymentRepo(false);
    var changes = 0;
    await tester.pumpWidget(
      _panel(
        repo,
        onChanged: () async {
          changes++;
        },
      ),
    );
    await tester.tap(find.text('Wallet'));
    await tester.pump();
    await tester.pumpAndSettle();
    expect(repo.walletPayments, 1);
    expect(find.text('Payment successful'), findsOneWidget);
    expect(changes, 0);
    await tester.tap(find.text('Continue to receipt'));
    await tester.pumpAndSettle();
    expect(changes, 1);
  });

  testWidgets('driver sees a cash confirmation and no action for Wallet', (
    tester,
  ) async {
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    final cash = _PaymentRepo(true)..method = 'CASH';
    await tester.pumpWidget(_panel(cash));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final swipe = tester.widget<RideSwipeButton>(find.byType(RideSwipeButton));
    swipe.onSwipe();
    await tester.pumpAndSettle();
    expect(cash.receipts, 1);
    expect(find.text('Payment successful'), findsOneWidget);
    await tester.tap(find.text('Continue to receipt'));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
    final wallet = _PaymentRepo(true)..method = 'WALLET';
    await tester.pumpWidget(_panel(wallet));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Verifying rider payment'), findsWidgets);
    expect(find.byType(RideSwipeButton), findsNothing);
    wallet.status = 'CAPTURED';
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.text('Payment successful'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('driver UPI sheet reflects capture reported by the ride', (
    tester,
  ) async {
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    final repo = _PaymentRepo(true)
      ..method = 'UPI'
      ..checkoutStarted = true;
    await tester.pumpWidget(_panel(repo));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Verifying rider payment'), findsWidgets);
    expect(find.byType(RideSwipeButton), findsNothing);
    repo.status = 'CAPTURED';
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.text('Payment successful'), findsOneWidget);
    expect(find.text('Continue to receipt'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'UPI launches Razorpay from the sheet and verifies server capture',
    (tester) async {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      const channel = MethodChannel('razorpay_flutter');
      final messenger = tester.binding.defaultBinaryMessenger;
      MethodCall? checkout;
      final returned = Completer<Map<String, dynamic>>();
      messenger.setMockMethodCallHandler(channel, (call) async {
        if (call.method != 'open') return null;
        checkout = call;
        return returned.future;
      });
      addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
      final repo = _PaymentRepo(false)..upiSupported = true;
      await tester.pumpWidget(_panel(repo));
      await tester.tap(find.text('UPI'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(checkout?.arguments['order_id'], 'order_ride');
      expect(checkout?.arguments['amount'], 15000);
      expect(checkout?.arguments['prefill'], {'contact': '+919876543210'});
      expect(find.text('Payment progress'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pump();
      expect(find.text('Continue to receipt'), findsNothing);
      returned.complete({
        'type': 0,
        'data': {'order_id': 'order_ride', 'payment_id': 'pay_ride'},
      });
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.text('Continue to receipt'), findsNothing);
      repo.status = 'CAPTURED';
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      expect(find.text('Payment successful'), findsOneWidget);
      expect(find.text('Continue to receipt'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
    variant: const TargetPlatformVariant({TargetPlatform.android}),
  );
}
