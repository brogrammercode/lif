import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/features/settings/controllers/wallet_controller.dart';
import 'package:user/features/settings/pages/wallet_add_money_page.dart';

class _Wallet extends WalletController {
  _Wallet()
    : super(
        driver: false,
        client: DioClient.forTesting(
          client: Dio(),
          createRefreshClient: Dio.new,
        ),
      ) {
    topUpsEnabled = true;
  }

  final topUp = WalletTopUp.fromMap({
    'id': '87c3e87b-9400-4032-8a64-344af5746bfc',
    'status': 'PENDING',
    'amount_paise': '1000',
    'created_at': '2026-11-27T00:00:00Z',
    'sdk_checkout': {'key_id': 'rzp_test_fixture', 'order_id': 'order_fixture'},
  });
  int checks = 0;

  @override
  Future<void> loadTopUps() async {}

  @override
  Future<WalletTopUp?> startTopUp(
    int paise, {
    required bool nativeCheckout,
  }) async {
    expect(nativeCheckout, isTrue);
    expect(paise, 1000);
    update(() => topUps = [topUp]);
    return topUp;
  }

  @override
  Future<String?> checkoutPhone() async => '+919876543210';

  @override
  Future<WalletTopUp?> checkTopUp(String id, {bool cancelled = false}) async {
    expect(id, topUp.id);
    expect(cancelled, isTrue);
    checks++;
    return topUp;
  }
}

void main() {
  test(
    'history reconciles a pending top-up and displays its ledger credit once',
    () async {
      const id = '87c3e87b-9400-4032-8a64-344af5746bfc';
      const date = '2026-11-27T00:00:00Z';
      var checks = 0;
      final dio = Dio(BaseOptions(baseUrl: 'https://wallet.example.test'));
      final topUp = {'id': id, 'amount_paise': '1000', 'created_at': date};
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            final Object data = switch (options.path) {
              '/wallet' => {
                'available_paise': checks == 0 ? '0' : '1000',
                'held_paise': '0',
                'has_more': false,
                'rows': [
                  if (checks > 0)
                    {
                      'id': 'entry',
                      'kind': 'TOP_UP',
                      'topup_id': id,
                      'available_delta_paise': '1000',
                      'held_delta_paise': '0',
                      'available_after_paise': '1000',
                      'created_at': date,
                    },
                ],
              },
              '/wallet/topups' => {
                'enabled': true,
                'rows': [
                  {...topUp, 'status': 'PENDING'},
                ],
              },
              '/wallet/topups/$id/check' => {
                ...topUp,
                'status': ++checks == 1 ? 'CAPTURED' : 'PENDING',
              },
              _ => throw StateError('Unexpected endpoint ${options.path}'),
            };
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'status': 'success', 'data': data},
              ),
            );
          },
        ),
      );
      final wallet = WalletController(
        driver: false,
        client: DioClient.forTesting(
          client: dio,
          createRefreshClient: () => dio,
        ),
      );
      addTearDown(wallet.dispose);
      await wallet.refreshHistory();
      expect(checks, 1);
      expect(wallet.availablePaise, 1000);
      expect(wallet.transactions.single.topUpId, id);
      expect(wallet.topUpsWithoutLedgerCredit, isEmpty);
    },
  );

  test(
    'reloads wallet top-ups without posting a status check for a malformed ID',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://wallet.example.test'));
      final requests = <String>[];
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            requests.add('${options.method} ${options.path}');
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'status': 'success',
                  'data': {
                    'enabled': true,
                    'rows': [
                      {'id': 'bad reference'},
                      {
                        'id': '87c3e87b-9400-4032-8a64-344af5746bfc',
                        'status': 'PENDING',
                        'amount_paise': '1000',
                        'created_at': '2026-11-27T00:00:00Z',
                      },
                    ],
                  },
                },
              ),
            );
          },
        ),
      );
      final wallet = WalletController(
        driver: false,
        client: DioClient.forTesting(
          client: dio,
          createRefreshClient: () => dio,
        ),
      );
      addTearDown(wallet.dispose);
      expect(await wallet.checkTopUp('bad reference'), isNull);
      expect(requests, ['GET /wallet/topups']);
      expect(wallet.topUps.single.id, '87c3e87b-9400-4032-8a64-344af5746bfc');
    },
  );

  testWidgets('uses the Add money page and locks back until Razorpay returns', (
    tester,
  ) async {
    const channel = MethodChannel('razorpay_flutter');
    final messenger = tester.binding.defaultBinaryMessenger;
    final result = Completer<Map<String, dynamic>>();
    MethodCall? checkout;
    messenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method != 'open') return null;
      checkout = call;
      return result.future;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
    final wallet = _Wallet();
    addTearDown(wallet.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showWalletAddMoney(context, wallet: wallet),
              child: const Text('Add money'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Add money'));
    await tester.pumpAndSettle();
    expect(find.text('Quick amount'), findsOneWidget);
    await tester.tap(find.text('1'));
    await tester.tap(find.text('0'));
    await tester.pumpAndSettle();
    expect(find.text('₹10'), findsOneWidget);
    await tester.tap(find.text('Continue to Razorpay'));
    await tester.pump();
    expect(checkout?.arguments['order_id'], 'order_fixture');
    expect(checkout?.arguments['prefill'], {'contact': '+919876543210'});
    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.byType(WalletAddMoneyPage), findsOneWidget);
    expect(wallet.checks, 0);

    result.complete({
      'type': 1,
      'data': {'code': 2, 'message': 'Cancelled'},
    });
    await tester.pumpAndSettle();
    expect(wallet.checks, 1);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(WalletAddMoneyPage), findsNothing);
  }, variant: const TargetPlatformVariant({TargetPlatform.android}));
}
