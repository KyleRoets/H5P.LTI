// "Video": host an uploaded video, or embed a YouTube or Vimeo video, anywhere in ReachLMS.
import { h, textField, mediaField, richField, richBlock, isBlank, emptyState, selectField } from '../util.js';
import { videoSource, videoSourceField, makePlayer } from './_video.js';

export default {
  id: 'videoplayer',
  name: 'Video',
  icon: 'type-videoplayer',
  category: 'media',
  graded: false,
  tagline: 'Upload a video, or embed one from YouTube or Vimeo.',
  about: {
    summary: 'Puts a video in any page, module or assignment in ReachLMS. Upload an MP4 (kept on the ReachStudio server, not in ReachLMS), or paste a YouTube or Vimeo link (hosted by them, so it uses no storage). Add a title, notes under the video and captions.',
    uses: ['Lecture recordings and screencasts', 'Welcome and instruction videos for a course', 'YouTube or Vimeo videos without leaving ReachLMS', 'Short demonstrations with captions for accessibility'],
    learners: 'Learners play the video inside the page, full screen if they like, with captions when you add them.',
    tip: 'Videos longer than a few minutes are best on YouTube or Vimeo (unlisted): they stream at the right quality for each learner and use none of your storage. Upload short clips, or videos that must not be on a public platform.',
  },
  defaults: () => ({ source: 'upload', video: '', link: '', title: '', notes: '', captions: '', poster: '', ratio: '16/9' }),
  example: () => ({
    title: 'A closer look at a cell',
    data: { source: 'upload', video: '/img/examples/cell-tour.mp4', link: '', title: 'Inside a cell', notes: '<p>Watch how the camera moves from the <strong>cell wall</strong> to the <strong>nucleus</strong>.</p>', captions: '', poster: '', ratio: '16/9' },
  }),

  editor(data, ctx) {
    return h('div', {},
      videoSourceField(data, ctx, ctx.onChange),
      textField('Title (optional)', data, 'title', ctx.onChange, { placeholder: 'Shown above the video' }),
      richField('Notes under the video (optional)', data, 'notes', ctx.onChange, { compact: true, placeholder: 'What to look out for, questions to think about…' }),
      h('details', { class: 'more' }, h('summary', {}, 'Captions and cover image (uploaded videos)'),
        mediaField('Captions (optional, .vtt)', data, 'captions', ctx.onChange, ctx, { accept: 'text/vtt,.vtt', file: 'Captions file', help: 'A WebVTT captions file. YouTube and Vimeo videos use their own captions.' }),
        mediaField('Cover image (optional)', data, 'poster', ctx.onChange, ctx, { help: 'Shown before an uploaded video starts.' })),
      selectField('Shape', data, 'ratio', [['16/9', 'Widescreen (16:9)'], ['4/3', 'Standard (4:3)'], ['1/1', 'Square'], ['9/16', 'Portrait (phone video)']], ctx.onChange));
  },

  render(data) {
    const src = videoSource(data);
    if (!src) return emptyState('type-videoplayer', 'Upload a video or add a YouTube or Vimeo link to get started.');
    const box = h('div', { class: `rs-video-wrap rs-videoplayer ${data.ratio === '9/16' ? 'portrait' : ''}`, style: { aspectRatio: data.ratio || '16/9' } });
    makePlayer(src, box, { captions: data.captions, poster: data.poster });
    return h('div', { class: 'rs-videobox' },
      data.title?.trim() && h('h3', { class: 'rs-video-title' }, data.title),
      box,
      !isBlank(data.notes) && richBlock(data.notes, 'rs-video-notes'));
  },
};
