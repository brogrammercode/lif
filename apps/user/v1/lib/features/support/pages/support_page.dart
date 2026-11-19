import 'package:user/features/support/controllers/support_controller.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/settings/widgets/settings_secondary.dart';
import 'package:user/features/support/widgets/support_contact_card.dart';
import 'package:user/features/support/widgets/support_request_sheet.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SupportPage extends StatefulWidget {
  final bool openRequest;
  final UserAppRepository? repository;
  const SupportPage({super.key, this.repository, this.openRequest = false});

  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  late final _controller = SupportController(
    widget.repository ?? UserAppRepository(),
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  UserAppRepository get _repository => _controller.repository;
  List<Map<String, dynamic>> get _tickets => _controller.tickets;
  Object? get _error => _controller.error;
  bool get _loading => _controller.loading;

  @override
  void initState() {
    super.initState();
    _load();
    if (widget.openRequest) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _newRequest();
      });
    }
  }

  Future<void> _load({bool preserve = false}) async {
    await _controller.load(preserve: preserve);
    final notice = _controller.notice;
    _controller.notice = null;
    if (mounted && notice != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(notice)));
    }
  }

  Future<void> _newRequest() async {
    final ticket = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SupportRequestSheet(repository: _repository),
    );
    if (!mounted || ticket == null) return;
    await _load(preserve: true);
    if (!mounted) return;
    final ticketId = '${ticket['id'] ?? ''}';
    if (ticketId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'The request was created but could not be opened. Find it in Help Me.',
          ),
        ),
      );
      return;
    }
    await Navigator.pushNamed(
      context,
      AppRoutes.supportTicket,
      arguments: ticketId,
    );
    if (mounted) await _load(preserve: true);
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.SUPPORT,
    scrollable: true,
    action: IconButton(
      tooltip: 'New support request',
      onPressed: _newRequest,
      icon: const Icon(Icons.add_comment_outlined, color: Colors.white),
    ),
    child: _body(),
  );

  Widget _body() {
    return RefreshIndicator(
      onRefresh: () => _load(preserve: true),
      color: RideTokens.accent,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
        children: [
          if (_error != null && _tickets.isEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: AppLoadError(
                message: ApiResult.errorMessage(_error!),
                onRetry: _load,
              ),
            ),
          if (_loading && _tickets.isEmpty)
            const _SupportConversationSkeleton(),
          if (!_loading && _tickets.isEmpty && _error == null)
            SettingsEmptyCard(
              icon: Icons.forum_outlined,
              title: UserAppCopy.EMPTY_SUPPORT,
              body: UserAppCopy.EMPTY_SUPPORT_DESCRIPTION,
              action: FilledButton.icon(
                onPressed: _newRequest,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.black,
                  foregroundColor: Colors.white,
                ),
                icon: const Icon(Icons.add_comment_outlined, size: 18),
                label: const Text('Start a conversation'),
              ),
            )
          else if (_tickets.isNotEmpty)
            for (var index = 0; index < _tickets.length; index++) ...[
              _ticket(_tickets[index]),
              if (index != _tickets.length - 1)
                const Padding(
                  padding: EdgeInsets.only(left: 56),
                  child: Divider(height: 1, color: Color(0xFFEEEEEE)),
                ),
            ],
          const SizedBox(height: 28),
          SupportContactCard(repository: _repository),
        ],
      ),
    );
  }

  Widget _ticket(Map<String, dynamic> ticket) {
    final status = '${ticket['status'] ?? 'OPEN'}';
    final messages = (ticket['messages'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final lastMessage = messages.isEmpty ? null : messages.last;
    final snippet = lastMessage == null
        ? 'No messages yet'
        : '${lastMessage['author_id'] == ticket['user_id'] ? 'You: ' : ''}${lastMessage['body'] ?? ''}';
    final timestamp = _compactTime(
      ticket['updated_at'] ??
          lastMessage?['created_at'] ??
          ticket['created_at'],
    );
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => Navigator.pushNamed(
          context,
          AppRoutes.supportTicket,
          arguments: ticket['id'],
        ).then((_) => _load(preserve: true)),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 2),
          child: Row(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: const BoxDecoration(
                      color: Color(0xFFF1F3F6),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      _statusIcon(status),
                      size: 22,
                      color: _statusColor(status),
                    ),
                  ),
                  Positioned(
                    right: -1,
                    bottom: -1,
                    child: Tooltip(
                      message: readableEnum(status),
                      child: Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: _statusColor(status),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${ticket['subject'] ?? 'Support request'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: RideTokens.ink,
                        fontSize: 14,
                        height: 1.25,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      snippet,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: RideTokens.muted,
                        fontSize: 12,
                        height: 1.3,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 48,
                child: Text(
                  timestamp,
                  textAlign: TextAlign.end,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: RideTokens.muted,
                    fontSize: 11,
                    fontWeight: FontWeight.w400,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _compactTime(dynamic value) {
    final parsed = DateTime.tryParse('$value')?.toLocal();
    if (parsed == null) return '';
    final elapsed = DateTime.now().difference(parsed);
    if (elapsed.isNegative || elapsed.inMinutes < 1) return 'now';
    if (elapsed.inHours < 1) return '${elapsed.inMinutes}m';
    if (elapsed.inDays < 1) return '${elapsed.inHours}h';
    if (elapsed.inDays < 7) return '${elapsed.inDays}d';
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${parsed.day} ${months[parsed.month - 1]}';
  }

  IconData _statusIcon(String status) => switch (status) {
    'RESOLVED' => Icons.check_circle_outline,
    'CLOSED' => Icons.lock_outline,
    'WAITING_FOR_USER' => Icons.mark_chat_unread_outlined,
    'IN_PROGRESS' => Icons.pending_actions_outlined,
    _ => Icons.chat_bubble_outline,
  };

  Color _statusColor(String status) => switch (status) {
    'RESOLVED' => const Color(0xFF2E7D5B),
    'CLOSED' => RideTokens.muted,
    'WAITING_FOR_USER' => const Color(0xFFB8791F),
    'IN_PROGRESS' => const Color(0xFF5368D8),
    _ => RideTokens.accent,
  };
}

class _SupportConversationSkeleton extends StatelessWidget {
  const _SupportConversationSkeleton();

  @override
  Widget build(BuildContext context) => Column(
    children: [
      AppSkeleton(
        label: 'Loading support conversations',
        child: Column(
          children: [
            for (var index = 0; index < 4; index++) ...[
              Padding(
                padding: const EdgeInsets.symmetric(
                  vertical: 13,
                  horizontal: 2,
                ),
                child: Row(
                  children: [
                    const SkeletonBox(width: 44, height: 44, circle: true),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          SkeletonBox(width: 150, height: 13),
                          SizedBox(height: 8),
                          SkeletonBox(width: 190, height: 11),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    const SkeletonBox(width: 36, height: 10),
                  ],
                ),
              ),
              if (index != 3)
                const Padding(
                  padding: EdgeInsets.only(left: 56),
                  child: Divider(height: 1, color: Color(0xFFEEEEEE)),
                ),
            ],
          ],
        ),
      ),
    ],
  );
}
