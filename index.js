const debug = require('debug')('vhs-hookhub-github-nomos')
debug('Loading vhs-hookhub-github-nomos')
debug(__dirname)

const express = require('express')
const router = express.Router()
const config = require('./config.json')
const { xHubSignatureMiddleware } = require('x-hub-signature-middleware')
const smb = require('slack-message-builder')

// Perform sanity check
router.use(function (req, res, next) {
    if (
        req.header('X-Hub-Signature') == null ||
        req.header('X-Hub-Signature').length < 40 ||
        req.header('X-GitHub-Event') == undefined ||
        req.header('X-GitHub-Event') == '' ||
        req.rawBody == undefined
    ) {
        res.status(412).send({
            result: 'ERROR',
            message: 'Missing or invalid request arguments'
        })
    } else {
        next()
    }
})

// Check X-Hub-Signature
router.use(
    xHubSignatureMiddleware({
        algorithm: 'sha1',
        secret: config.github.secret,
        require: true,
        getRawBody: (req) => req.rawBody
    })
)

/* Default handler. */
router.use('/', async function (req, res, next) {
    debug('Handling default request')

    let post_body = generateMessage(req.header('X-GitHub-Event'), req.body)

    debug('post_body:', post_body)

    const post_options = {
        method: 'POST',
        body: JSON.stringify(post_body)
    }

    try {
        const data = await (await fetch(config.slack.url, post_options)).json()

        res.send({
            result: 'OK',
            message: data
        })
    } catch (err) {
        res.status(500).send({
            result: 'ERROR',
            message: err
        })
    }
})

module.exports = router

const generateMessage = function (event_type, payload) {
    debug(`Generating message for ${event_type}`)

    let slack_message = smb()
        .username(config.slack.options.username)
        .iconEmoji(config.slack.options.icon_emoji)
        .channel(config.slack.options.channel)

    switch (event_type) {
        case 'push':
            debug(`Handling push event`)
            payload.commits.forEach(function (commit) {
                slack_message = slack_message
                    .text(
                        "The following commit(s) got pushed to '" +
                            payload.repository.name +
                            "':\r\r"
                    )
                    .attachment()
                    .fallback('Required plain-text summary of the attachment.')
                    .color('#0000cc')
                    .authorName(payload.sender.login)
                    .authorLink(payload.sender.html_url)
                    .authorIcon(payload.sender.avatar_url)
                    .title('Commit: ' + commit.id)
                    .titleLink(commit.url)
                    .text(commit.message)
                    .footer('Via: vhs-hookhub-github-nomos')
                    .ts(Math.round(Date.parse(commit.timestamp) / 1000))
                    .end()
            })
            break
        case 'issues':
            switch (payload.action) {
                case 'closed':
                    slack_message = slack_message
                        .text(
                            `Issue ${payload.issue.number} - ${payload.issue.title} was closed by ${payload.issue.user.login}\r\r`
                        )
                        .attachment()
                        .fallback(
                            'Required plain-text summary of the attachment.'
                        )
                        .color('#0000cc')
                        .authorName(payload.issue.user.login)
                        .authorLink(payload.issue.user.html_url)
                        .authorIcon(payload.issue.user.avatar_url)
                        .title('Issue: ' + payload.issue.number)
                        .titleLink(payload.issue.title)
                        .text('See issue for closing comment')
                        .footer('Via: vhs-hookhub-github-nomos')
                        .ts(
                            Math.round(
                                Date.parse(payload.issue.closed_at) / 1000
                            )
                        )
                        .end()
                    break
                default:
                    slack_message = slack_message
                        .text(
                            `Issue ${payload.issue.number} - ${payload.issue.title} was ${payload.action} by ${payload.issue.user.login}\r\r`
                        )
                        .attachment()
                        .fallback(
                            'Required plain-text summary of the attachment.'
                        )
                        .color('#0000cc')
                        .authorName(payload.issue.user.login)
                        .authorLink(payload.issue.user.html_url)
                        .authorIcon(payload.issue.user.avatar_url)
                        .title('Issue: ' + payload.issue.number)
                        .titleLink(payload.issue.title)
                        .text('See issue for more info')
                        .footer('Via: vhs-hookhub-github-nomos')
                        .ts(
                            Math.round(
                                Date.parse(payload.issue.closed_at) / 1000
                            )
                        )
                        .end()
                    break
            }
            break
        default:
            debug(`Handling unknown event`)
            slack_message = slack_message.text(
                "We received a new '" +
                    event_type +
                    "' notification for '" +
                    payload.repository.name +
                    "', but we didn't know what to do with this event!"
            )
            break
    }

    debug(`Returning JSON payload`)
    return slack_message.json()
}
