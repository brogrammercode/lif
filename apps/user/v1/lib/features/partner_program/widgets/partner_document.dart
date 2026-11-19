import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:flutter_html_table/flutter_html_table.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/components/ui/solid_ui.dart';

class PartnerDocument extends StatelessWidget {
  final Map<String, dynamic> document;
  const PartnerDocument({super.key, required this.document});
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        '${document['title'] ?? ''}',
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: RideTokens.ink,
        ),
      ),
      const SizedBox(height: 2),
      Text(
        'Version ${document['version'] ?? ''}',
        style: const TextStyle(fontSize: 11, color: RideTokens.muted),
      ),
      const SizedBox(height: 8),
      Html(
        data: '${document['html'] ?? ''}',
        extensions: [
          TableHtmlExtension(),
          TagExtension(
            tagsToExtend: {'input'},
            builder: (extension) => Icon(
              extension.attributes.containsKey('checked')
                  ? Icons.check_box_outlined
                  : Icons.check_box_outline_blank,
              size: 18,
              color: RideTokens.accent,
            ),
          ),
        ],
        style: {
          'body': Style(
            margin: Margins.zero,
            lineHeight: const LineHeight(1.45),
            fontSize: FontSize(14),
            color: RideTokens.ink,
          ),
          'table': Style(display: Display.block),
          'td': Style(
            padding: HtmlPaddings.all(8),
            border: Border.all(color: RideTokens.line),
          ),
        },
        onLinkTap: (url, attributes, element) async {
          final uri = Uri.tryParse(url ?? '');
          if (uri == null || !['https', 'mailto', 'tel'].contains(uri.scheme)) {
            return;
          }
          try {
            if (await launchUrl(uri, mode: LaunchMode.externalApplication)) {
              return;
            }
          } catch (_) {
            // Missing platform handlers are shown as a recoverable message.
          }
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('This link could not be opened.')),
            );
          }
        },
      ),
    ],
  );
}
