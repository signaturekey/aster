# Conversations

## Purpose

Provide durable private text conversations for mutual matches and project teams with membership-based access.

## ADDED Requirements

### Requirement: Authorized conversation access

Direct conversations SHALL be created only by mutual matching; project conversations SHALL follow project membership. Only current conversation members SHALL read messages, send messages, or receive conversation events. No arbitrary direct-chat or standalone group-chat creation SHALL be exposed.

#### Scenario: Nonmember requests messages

- **WHEN** a user outside a conversation requests its history
- **THEN** the API returns 404 without revealing messages or participants

#### Scenario: Project membership revoked

- **WHEN** a user leaves or is removed from a project
- **THEN** subsequent history reads, message writes, and event deliveries for its conversation are denied

### Requirement: Complete project history for current members

New and returning project members SHALL be able to read the entire persisted project conversation history, including messages sent before their membership. Returning after leave or removal SHALL require a new accepted application. Former members SHALL have no server-side history access; previously downloaded copies cannot be recalled.

#### Scenario: New member reads earlier discussion

- **WHEN** an accepted applicant retrieves project chat history
- **THEN** authorized pagination includes messages from before they joined

#### Scenario: Former member returns

- **WHEN** a former member is accepted through a new application
- **THEN** full project conversation access is restored without creating a new conversation

### Requirement: Durable text messages

The system SHALL persist nonempty text messages with a server-assigned ID, sender, timestamp, and conversation. Sending SHALL accept a client-generated request ID unique per sender and conversation to prevent duplicates on retries. History SHALL be cursor-paginated in a deterministic order.

#### Scenario: Retried message send

- **WHEN** a sender retries a message with the same request ID and content
- **THEN** the original message is returned and only one message exists

#### Scenario: Request ID reused with different content

- **WHEN** a sender reuses a request ID for different text
- **THEN** the API returns a conflict without changing the original message

### Requirement: Authenticated SSE updates

The system SHALL expose an authenticated SSE stream for committed conversation events while using HTTP for message sending and history. Event data SHALL have a documented shared schema. Live delivery SHALL enforce current session and membership access; a connection-time membership check alone SHALL NOT authorize future events.

#### Scenario: New committed message

- **WHEN** an authorized member is connected and a message commits to their conversation
- **THEN** the stream provides a schema-valid event identifying the conversation and message

#### Scenario: Membership revoked while connected

- **WHEN** a connected user is removed from a project and further messages commit
- **THEN** those conversation events are not delivered to the former member

### Requirement: Commit-before-delivery

Live updates SHALL reference only committed messages. Clients SHALL be able to recover missing messages using persisted history after reconnecting. The system SHALL NOT promise exactly-once event delivery; clients SHALL deduplicate by message ID.

#### Scenario: Disconnected recipient

- **WHEN** a member reconnects after messages were committed while offline
- **THEN** they can retrieve the missed messages through authorized history requests
