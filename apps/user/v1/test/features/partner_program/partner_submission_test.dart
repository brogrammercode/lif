import 'package:user/features/partner_program/partner_form_validation.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/partner_program/pages/partner_program_page.dart';
import 'package:user/features/partner_program/partner_draft_store.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';
import 'package:user/core/network/dio_client.dart';

class UploadAdapter implements HttpClientAdapter {
  final bodies = <Map<String, dynamic>>[];
  final authorizations = <String?>[];
  final paths = <String>[];
  bool unauthorizedOnce = false;
  bool invalidReceipt = false;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final body = await utf8.decoder.bind(requestStream!).join();
    bodies.add(jsonDecode(body) as Map<String, dynamic>);
    authorizations.add(options.headers['Authorization'] as String?);
    paths.add(options.path);
    if (unauthorizedOnce && bodies.length == 1) {
      return ResponseBody.fromString(
        jsonEncode({
          'message': 'The access token is invalid or expired',
          'error_code': 'INVALID_TOKEN',
        }),
        401,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    return ResponseBody.fromString(
      jsonEncode({
        'status': 'success',
        'data': options.path.endsWith('/applications') && !invalidReceipt
            ? {'id': 'application', 'version': 1, 'status': 'SUBMITTED'}
            : {'id': 'private-asset'},
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class RefreshAdapter implements HttpClientAdapter {
  final String token;
  int calls = 0;
  RefreshAdapter(this.token);
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls++;
    return ResponseBody.fromString(
      jsonEncode({
        'data': {'access_token': token, 'refresh_token': 'rotated-refresh'},
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

String accessToken(String id) =>
    'e30.${base64Url.encode(utf8.encode(jsonEncode({'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600, 'sub': id}))).replaceAll('=', '')}.fixture';

class MemoryDraft extends PartnerDraftStore {
  MemoryDraft() : super(directory: Directory.systemTemp, userId: 'fixture');
  Map<String, dynamic>? value;
  int cleared = 0;
  bool failClear = false;
  bool failSave = false;
  Completer<void>? blockedRead;
  int reads = 0;
  @override
  Future<void> save(Map<String, dynamic> draft) async {
    if (failSave) throw const FileSystemException('Disk unavailable');
    value = jsonDecode(jsonEncode(draft)) as Map<String, dynamic>;
  }

  @override
  Future<Map<String, dynamic>?> read() async {
    reads++;
    final snapshot = value == null ? null : Map<String, dynamic>.from(value!);
    if (blockedRead != null) await blockedRead!.future;
    return snapshot;
  }

  @override
  Future<void> clear() async {
    if (failClear) throw const FileSystemException('Disk unavailable');
    value = null;
    cleared++;
  }

  @override
  Future<PartnerLocalFile> stage(
    String name,
    Stream<List<int>> source, {
    int maxBytes = 3000000,
  }) async {
    await source.drain<void>();
    return PartnerLocalFile(name: name, path: '/fixture/$name');
  }

  @override
  Future<List<PartnerLocalFile>> restoreFiles(
    dynamic rows,
    Set<String> assets,
  ) async => [
    for (final row in rows as List)
      PartnerLocalFile(
        name: row['name'] as String,
        path: row['path'] as String?,
        assetId: assets.contains(row['asset_id'])
            ? row['asset_id'] as String
            : null,
      ),
  ];
}

class SubmissionRepo extends PartnerProgramRepository {
  final uploads = <String>[];
  final assets = <Map<String, dynamic>>[];
  Map<String, dynamic>? submitted;
  bool failUpload = false, failSubmit = false;
  int active = 0, maxActive = 0, submissions = 0;
  @override
  Future<Map<String, dynamic>> workflow() async => {
    'policy': {
      'title': 'Partner policy',
      'version': 1,
      'html': '<p>Policy</p>',
    },
    'application': submitted == null
        ? null
        : {
            'id': 'application',
            'status': 'SUBMITTED',
            'version': 1,
            'contact_email': submitted!['contact_email'],
            'whatsapp_phone': submitted!['whatsapp_phone'],
            'fields': [
              for (final answer in submitted!['answers'] as List)
                {...answer as Map, 'status': 'PENDING'},
            ],
          },
    'requirements': [
      for (final id in ['first', 'second', '__live_selfie__'])
        {
          'id': id,
          'label': id == '__live_selfie__' ? 'Live selfie' : '$id documents',
          'field_type': id == '__live_selfie__' ? 'IMAGE' : 'FILE',
          'is_required': true,
          'allow_multiple': id != '__live_selfie__',
          if (id == '__live_selfie__') 'capture_mode': 'CAMERA',
        },
    ],
    'assets': assets,
  };
  @override
  Future<Map<String, dynamic>> uploadFile(
    String fieldId,
    String fileName,
    String path,
  ) async {
    uploads.add('$fieldId:$fileName');
    active++;
    if (active > maxActive) maxActive = active;
    try {
      await Future<void>.delayed(const Duration(milliseconds: 10));
      if (failUpload && fieldId == 'second') {
        throw StateError('Upload interrupted');
      }
      final asset = {'id': 'asset-${assets.length}', 'file_name': fileName};
      assets.add(asset);
      return asset;
    } finally {
      active--;
    }
  }

  @override
  Future<void> submit(Map<String, dynamic> input) async {
    submissions++;
    submitted = input;
    if (failSubmit) throw StateError('Response lost');
  }
}

class FailedReloadRepo extends SubmissionRepo {
  bool failReload = true;
  @override
  Future<Map<String, dynamic>> workflow() async {
    if (submitted != null && failReload) {
      throw StateError('Status refresh unavailable');
    }
    return super.workflow();
  }
}

class CommitResponseAdapter implements HttpClientAdapter {
  Map<String, dynamic>? saved;
  bool different = false;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.method == 'POST') {
      saved =
          jsonDecode(await utf8.decoder.bind(requestStream!).join())
              as Map<String, dynamic>;
      return ResponseBody.fromString(
        jsonEncode({'message': 'Gateway lost response'}),
        503,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    return ResponseBody.fromString(
      jsonEncode({
        'data': {
          'application': {
            'id': 'application',
            'version': 1,
            'status': 'SUBMITTED',
            'contact_email': saved!['contact_email'],
            'whatsapp_phone': saved!['whatsapp_phone'],
            'fields': [
              for (final a in saved!['answers'] as List)
                {...a as Map, if (different) 'value': 'another revision'},
            ],
          },
        },
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class ExpiredSubmitRepo extends SubmissionRepo {
  @override
  Future<void> submit(Map<String, dynamic> input) async {
    submissions++;
    final options = RequestOptions(path: '/partner-program/applications');
    throw DioException(
      requestOptions: options,
      response: Response(
        requestOptions: options,
        statusCode: 401,
        data: {'message': 'Authentication is required'},
      ),
      type: DioExceptionType.badResponse,
    );
  }
}

class LargePolicyAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    jsonEncode({
      'data': {
        'policy': {'html': 'x' * 2000000},
        'data_url': 'private-media',
      },
    }),
    200,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
  @override
  void close({bool force = false}) {}
}

Widget page(SubmissionRepo repo, MemoryDraft store) => ScreenUtilInit(
  designSize: const Size(390, 844),
  builder: (_, child) => MaterialApp(
    home: PartnerProgramPage(
      repository: repo,
      createDraftStore: (_) async => store,
      currentUser: () async => const UserModel(
        id: 'fixture',
        role: 'RIDER',
        status: 'ACTIVE',
        email: 'rider@example.test',
        phoneE164: '+919999999999',
      ),
      selectFiles: (definition) async => List.generate(
        8,
        (i) => PartnerLocalFile(
          name: '${definition['id']}-$i.pdf',
          path: '/fixture/${definition['id']}-$i.pending',
        ),
      ),
      captureSelfie: () async =>
          XFile.fromData(Uint8List.fromList([1, 2, 3]), name: 'selfie.jpg'),
    ),
  ),
);

Stream<List<int>> documentChunks(int size) async* {
  final chunk = Uint8List(65536);
  while (size > 0) {
    final count = size < chunk.length ? size : chunk.length;
    yield Uint8List.sublistView(chunk, 0, count);
    size -= count;
  }
}

Future<void> press(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    250,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> fill(
  WidgetTester tester,
  SubmissionRepo repo,
  MemoryDraft store,
) async {
  await tester.pumpWidget(page(repo, store));
  await tester.pumpAndSettle();
  await press(tester, find.byType(CheckboxListTile));
  await press(tester, find.text('Continue to application'));
  for (final id in ['first', 'second']) {
    final tile = find.byKey(ValueKey('partner-upload-$id'));
    await tester.scrollUntilVisible(
      tile,
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await press(
      tester,
      find.descendant(of: tile, matching: find.text('Choose files')),
    );
  }
  await press(tester, find.text('Take live selfie'));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://partner.example.test/api/v2',
    ),
  );
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  testWidgets(
    'submission stops before uploads when the recovery draft cannot be persisted',
    (tester) async {
      final repo = SubmissionRepo();
      final store = MemoryDraft();
      await fill(tester, repo, store);
      store.failSave = true;
      await press(tester, find.text('Submit application'));
      expect(repo.uploads, isEmpty);
      expect(repo.submissions, 0);
      expect(
        find.textContaining('Local draft could not be saved'),
        findsWidgets,
      );
      expect(store.value, isNotNull);
      expect(store.cleared, 0);
      expect(tester.takeException(), isNull);
      store.failSave = false;
      await press(tester, find.text('Submit application'));
      expect(repo.submissions, 1);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'a delayed background draft restore cannot overwrite a later committed submission',
    (tester) async {
      final repo = SubmissionRepo();
      final store = MemoryDraft();
      await tester.pumpWidget(page(repo, store));
      await tester.pumpAndSettle();
      store.value = {
        'format': 1,
        'application_version': 0,
        'policy_version': 1,
        'email': 'stale@example.test',
        'accepted': false,
        'show_form': false,
      };
      final gate = Completer<void>();
      store.blockedRead = gate;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      await tester.pump();
      expect(store.reads, 2);
      await fill(tester, repo, store);
      await press(tester, find.text('Submit application'));
      expect(repo.submitted?['contact_email'], 'rider@example.test');
      expect(repo.submissions, 1);
      gate.complete();
      await tester.pumpAndSettle();
      expect(find.text('Submit application'), findsNothing);
      expect(store.cleared, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  test(
    'many selected documents stay on disk; encrypted metadata contains no payload',
    () async {
      final dir = await Directory.systemTemp.createTemp('partner-draft-test-');
      final store = PartnerDraftStore(directory: dir, userId: 'one');
      final files = <PartnerLocalFile>[];
      try {
        for (var i = 0; i < 20; i++) {
          files.add(
            await store.stage('document-$i.pdf', documentChunks(3000000)),
          );
        }
        await store.save({
          'format': 1,
          'files': files.map((file) => file.toJson()).toList(),
        });
        final draft = await store.read();
        expect(jsonEncode(draft).length, lessThan(8000));
        expect(jsonEncode(draft), isNot(contains('data_url')));
        expect(await store.restoreFiles(draft!['files'], {}), hasLength(10));
        expect(
          (await files
              .map((f) => File(f.path!).length())
              .fold<Future<int>>(
                Future.value(0),
                (sum, length) async => await sum + await length,
              )),
          60000000,
        );
        await store.clear();
        expect(await store.read(), isNull);
        expect(await dir.list().length, 0);
      } finally {
        await dir.delete();
      }
    },
  );
  test(
    'oversize or empty streams leave no partial file and other accounts cannot restore paths',
    () async {
      final dir = await Directory.systemTemp.createTemp('partner-draft-test-');
      final foreign = await Directory.systemTemp.createTemp(
        'partner-foreign-test-',
      );
      final store = PartnerDraftStore(directory: dir, userId: 'one');
      try {
        await expectLater(
          store.stage(
            'large.pdf',
            Stream.fromIterable([Uint8List(20), Uint8List(20)]),
            maxBytes: 30,
          ),
          throwsStateError,
        );
        await expectLater(
          store.stage('empty.pdf', const Stream.empty()),
          throwsStateError,
        );
        expect(await dir.list().length, 0);
        final other = await File(
          '${foreign.path}/private.pdf',
        ).writeAsString('private');
        expect(
          await store.restoreFiles([
            {'name': 'private.pdf', 'path': other.path},
          ], {}),
          isEmpty,
        );
        await store.remove(
          PartnerLocalFile(name: 'private.pdf', path: other.path),
        );
        expect(await other.exists(), isTrue);
        await other.delete();
      } finally {
        await dir.delete();
        await foreign.delete();
      }
    },
  );
  test(
    'file worker sends one valid JSON body with camera provenance and rejects oversized input before sending',
    () async {
      final dir = await Directory.systemTemp.createTemp('partner-encode-test-');
      final file = File('${dir.path}/selfie.jpg');
      final adapter = UploadAdapter();
      final dio = Dio(
        BaseOptions(
          baseUrl: 'https://partner.example.test/api/v2',
          contentType: Headers.jsonContentType,
        ),
      )..httpClientAdapter = adapter;
      final client = DioClient.forTesting(
        client: dio,
        createRefreshClient: () => throw StateError('No refresh expected'),
      );
      final repo = PartnerProgramRepository(client: client);
      try {
        await file.writeAsBytes([1, 2, 3]);
        expect(
          (await repo.uploadFile(
            '__live_selfie__',
            'live_selfie.jpg',
            file.path,
          ))['id'],
          'private-asset',
        );
        expect(adapter.bodies.single, {
          'field_id': '__live_selfie__',
          'file_name': 'live_selfie.jpg',
          'capture_source': 'CAMERA',
          'data_url': 'data:image/jpeg;base64,AQID',
        });
        await file.writeAsBytes(Uint8List(3000001));
        await expectLater(
          repo.uploadFile('document', 'document.pdf', file.path),
          throwsStateError,
        );
        expect(adapter.bodies, hasLength(1));
      } finally {
        dio.close();
        await file.delete();
        await dir.delete();
      }
    },
  );
  testWidgets(
    'submits sixteen documents and a camera selfie sequentially then renders review state',
    (tester) async {
      final repo = SubmissionRepo(), store = MemoryDraft();
      await fill(tester, repo, store);
      expect(repo.uploads, isEmpty);
      await press(tester, find.text('Submit application'));
      expect(repo.maxActive, 1);
      expect(repo.uploads, hasLength(17));
      expect(repo.submissions, 1);
      final reviewPosition = tester
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position;
      expect(reviewPosition.pixels, 0);
      expect(find.text('submitted'), findsOneWidget);
      expect(store.value, isNull);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  test(
    'a protected upload refreshes its token and replays the same JSON, then submits with the new token',
    () async {
      final dir = await Directory.systemTemp.createTemp('partner-auth-test-');
      final file = await File('${dir.path}/selfie.jpg').writeAsBytes([1, 2, 3]);
      final oldToken = accessToken('old'), newToken = accessToken('new');
      final adapter = UploadAdapter()..unauthorizedOnce = true;
      final refresh = RefreshAdapter(newToken);
      final dio = Dio(
        BaseOptions(
          baseUrl: 'https://partner.example.test/api/v2',
          contentType: Headers.jsonContentType,
        ),
      )..httpClientAdapter = adapter;
      final client = DioClient.forTesting(
        client: dio,
        createRefreshClient: () =>
            Dio(BaseOptions(baseUrl: 'https://partner.example.test/api/v2'))
              ..httpClientAdapter = refresh,
      );
      await client.saveTokens(oldToken, 'original-refresh');
      final repo = PartnerProgramRepository(client: client);
      try {
        await repo.uploadFile('__live_selfie__', 'selfie.jpg', file.path);
        await repo.submit({'version': 0, 'answers': []});
        expect(refresh.calls, 1);
        expect(adapter.paths, [
          '/partner-program/assets',
          '/partner-program/assets',
          '/partner-program/applications',
        ]);
        expect(adapter.bodies[0], adapter.bodies[1]);
        expect(adapter.authorizations, [
          'Bearer $oldToken',
          'Bearer $newToken',
          'Bearer $newToken',
        ]);
      } finally {
        dio.close();
        await file.delete();
        await dir.delete();
      }
    },
  );
  testWidgets(
    'partial upload failure keeps the draft and retries only unfinished documents',
    (tester) async {
      final repo = SubmissionRepo()..failUpload = true;
      final store = MemoryDraft();
      await fill(tester, repo, store);
      await press(tester, find.text('Submit application'));
      expect(repo.submissions, 0);
      expect(store.value, isNotNull);
      repo.failUpload = false;
      await press(tester, find.text('Submit application'));
      expect(repo.uploads.where((v) => v.startsWith('first:')), hasLength(8));
      expect(
        repo.uploads.where((v) => v.startsWith('__live_selfie__:')),
        hasLength(1),
      );
      expect(repo.submissions, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'a committed submission with a lost response restores server status after reopening',
    (tester) async {
      final repo = SubmissionRepo()..failSubmit = true;
      final store = MemoryDraft();
      await fill(tester, repo, store);
      await press(tester, find.text('Submit application'));
      expect(store.value, isNotNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      await tester.pumpWidget(page(repo, store));
      await tester.pumpAndSettle();
      expect(find.text('submitted'), findsOneWidget);
      expect(find.text('Submit application'), findsNothing);
      expect(repo.submissions, 1);
      expect(store.value, isNull);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'reopening a partially uploaded draft restores selections and reuses successful file IDs',
    (tester) async {
      final repo = SubmissionRepo()..failUpload = true;
      final store = MemoryDraft();
      await fill(tester, repo, store);
      await press(tester, find.text('Submit application'));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      await tester.pumpWidget(page(repo, store));
      await tester.pumpAndSettle();
      expect(find.text('Continue to application'), findsNothing);
      repo.failUpload = false;
      await press(tester, find.text('Submit application'));
      expect(repo.uploads.where((v) => v.startsWith('first:')), hasLength(8));
      expect(repo.submissions, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'local cleanup errors cannot turn a completed application into a failed form',
    (tester) async {
      final repo = SubmissionRepo();
      final store = MemoryDraft()..failClear = true;
      await fill(tester, repo, store);
      await press(tester, find.text('Submit application'));
      await tester.scrollUntilVisible(
        find.text('submitted'),
        -400,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('submitted'), findsOneWidget);
      expect(find.text('Submit application'), findsNothing);
      expect(repo.submissions, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  test(
    'a long application validates required offscreen fields from its complete draft',
    () {
      final definitions = List.generate(
        80,
        (i) => <String, dynamic>{
          'id': 'f$i',
          'label': 'Field $i',
          'field_type': 'STRING',
          'is_required': true,
        },
      );
      final values = {for (var i = 0; i < 80; i++) 'f$i': 'filled'};
      values['f0'] = '';
      expect(
        validatePartnerDraft(
          definitions,
          values,
          email: 'rider@example.test',
          phone: '+919999999999',
        ),
        'Field 0 is required.',
      );
      values['f0'] = 'filled';
      expect(
        validatePartnerDraft(
          definitions,
          values,
          email: 'rider@example.test',
          phone: '+919999999999',
        ),
        isNull,
      );
    },
  );
  testWidgets(
    'a saved submission survives a failed immediate status reload without becoming editable again',
    (tester) async {
      final repo = FailedReloadRepo(), store = MemoryDraft();
      await fill(tester, repo, store);
      await press(tester, find.text('Submit application'));
      expect(repo.submissions, 1);
      expect(find.text('Submit application'), findsNothing);
      expect(
        find.text(
          'Your application was submitted. Refresh to load its review status.',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      repo.failReload = false;
      await press(tester, find.text('Load review status'));
      expect(find.text('submitted'), findsOneWidget);
      expect(repo.submissions, 1);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  test(
    'lost final response recovers only the exact saved revision without sending another POST',
    () async {
      final adapter = CommitResponseAdapter();
      final dio = Dio(
        BaseOptions(
          baseUrl: 'https://partner.example.test/api/v2',
          contentType: Headers.jsonContentType,
        ),
      )..httpClientAdapter = adapter;
      final client = DioClient.forTesting(
        client: dio,
        createRefreshClient: () => throw StateError('No refresh expected'),
      );
      final repo = PartnerProgramRepository(client: client);
      final input = <String, dynamic>{
        'version': 0,
        'contact_email': 'rider@example.test',
        'whatsapp_phone': '+919999999999',
        'answers': [
          {
            'requirement_id': 'selfie',
            'value': ['private-selfie'],
          },
        ],
      };
      try {
        await repo.submit(input);
        adapter.different = true;
        await expectLater(repo.submit(input), throwsA(isA<DioException>()));
      } finally {
        dio.close();
      }
    },
  );
  testWidgets(
    'an expired protected submission offers sign-in without losing any uploaded selections',
    (tester) async {
      final repo = ExpiredSubmitRepo(), store = MemoryDraft();
      await fill(tester, repo, store);
      await press(tester, find.text('Submit application'));
      expect(repo.submissions, 1);
      expect(store.value, isNotNull);
      expect(repo.uploads, hasLength(17));
      expect(store.cleared, 0);
      await tester.scrollUntilVisible(
        find.text('Sign in again'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.text('Sign in again'), findsOneWidget);
      final position = tester
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position;
      expect(
        position.pixels,
        lessThanOrEqualTo(position.maxScrollExtent + 0.5),
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  test(
    'large policy logging is bounded and private media never reaches the terminal',
    () async {
      final messages = <String>[];
      final previous = debugPrint;
      final dio = Dio(
        BaseOptions(baseUrl: 'https://partner.example.test/api/v2'),
      )..httpClientAdapter = LargePolicyAdapter();
      final client = DioClient.forTesting(
        client: dio,
        createRefreshClient: () => throw StateError('No refresh expected'),
      );
      debugPrint = (String? message, {int? wrapWidth}) {
        messages.add(message ?? '');
      };
      try {
        final response = await client.getData('/partner-program/me');
        expect((response['data']['policy']['html'] as String).length, 2000000);
        final output = messages.join();
        expect(output.length, lessThan(6000));
        expect(output, contains('characters omitted'));
        expect(output, isNot(contains('private-media')));
      } finally {
        debugPrint = previous;
        dio.close();
      }
    },
  );
  test(
    'a malformed successful HTTP response cannot discard a draft as if submission were confirmed',
    () async {
      final adapter = UploadAdapter()..invalidReceipt = true;
      final dio = Dio(
        BaseOptions(
          baseUrl: 'https://partner.example.test/api/v2',
          contentType: Headers.jsonContentType,
        ),
      )..httpClientAdapter = adapter;
      final repo = PartnerProgramRepository(
        client: DioClient.forTesting(
          client: dio,
          createRefreshClient: () => throw StateError('No refresh expected'),
        ),
      );
      try {
        await expectLater(
          repo.submit({'version': 0, 'answers': []}),
          throwsFormatException,
        );
      } finally {
        dio.close();
      }
    },
  );
}
