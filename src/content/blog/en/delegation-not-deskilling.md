---
title: 'Delegation, not deskilling'
description: 'A note from someone who started leaning on LLMs heavily around the same time he moved from writing code to owning product and architecture. Going from coder to operator of an agentic team is not losing a craft. It is the same step up the abstraction ladder our field has taken several times before.'
date: 2026-06-20
tags: [process, meta, opinion]
order: 9
---

A podcast I follow spent its 529th episode on LLMs, so I want to throw in my two cents.
It is really one observation, from someone who started leaning on these tools heavily
around the same time he began spending more of his week on product and architecture than
on writing code.

## Why I stopped reading every line

At some point I deliberately made myself stop reviewing every character the model
produced. What let me do that was delegation.

I have a broader view of the product now than I used to. I can decide its architecture,
lay down the clean-code rules it should follow, set up the pipelines, require tests. The
actual typing of the code I can hand off to an AI, the way I would hand it to a developer
on my team. That leaves me free to think about the product I am building instead of the
implementation of every function. In practice I have turned into a small product owner, a
small manager of my own product, or the company's.

And a manager who cannot delegate is not much of a manager. If, instead of setting up a
process and a framework, you spend your time looking over shoulders and checking what your
report wrote in each commit, you have stopped doing the job.

## The deskilling worry

A good chunk of the episode was about deskilling, and it is a fair thing to raise. Am I
becoming a worse developer because of this shift, slower and duller?

I do not think there is anything new here, in the worry or in what is actually going on.
This happens every time technology takes a step and a new kind of specialist appears who
works one level of abstraction higher and gets more done per hour. Some of what the man
cutting sheet metal by hand had to know is simply not needed by the person running the CNC
machine.

A good carpenter, the kind who inherited the trade, can cut a tiny figurine more precisely
than the mill ever will. But the mill turns out a hundred of the parts people actually
order in an hour, at a complexity the carpenter could not finish in a lifetime. Those are
different jobs, and there is room for both.

## We have been here before

Our field has gone through this several times already. The first programs were punched onto
cards by mathematicians and physicists, and the program was more or less welded to the
machine it ran on. Then the work moved up a level of abstraction, and at each step some
knowledge stopped mattering while new knowledge appeared, and the programs themselves lost
a few things and gained a great deal more.

Assembly was not as portable or as reliable as C. C++ arrived with concepts that bloated
the programs but made them maintainable at a size assembly could never reach. When Java
showed up, the C++ crowd had a whole genre of memes about Java developers who did not
understand memory and let the VM eat all of it. And it was exactly those developers, and
that JVM that would run your code on a flat-iron if you asked it to, who gave us the
enterprise boom and Android.

Every generation grumbled that the next one was losing the skills. Every next generation
pushed the work onto a new level anyway, with a big jump in volume and, once the processes
and the standards and the training had caught up, in quality too.

## Coders and operators

That is where we are now. There are carpenters and there are CNC operators. There are
coders and there are LLM operators.

So I would not call it deskilling, and I would not call it going soft. It is handing off
the routine and moving up a level of abstraction, picking up new skills that get more done.
It comes with caveats for now, because we are in the middle of the transition, but the
trend is fairly clear.

You can sit and hope the AI bubble bursts, the same way people once hoped for a crisis that
would push the worker out of the city and back to the village. But if we are talking about
the kind of progress that does not, short of a catastrophe, roll back a step, then this is
where things are heading.

## I still like writing nice code

None of this means I stopped enjoying good code. Like the two hosts said about themselves, I
have code I cannot quite bring myself to leave alone. Often that has nothing to do with the
quality of the product. It is a preference, the professional deformation you pick up over
the years, a bit of geekery, my own taste. But if I cannot get past it during actual work,
if I cannot automate everything except what the product genuinely requires for a real
reason, then I am doing crochet on the clock. If I can afford that, good. On average it is
not what production needs from me, it is a hobby.

What the factory and the progress behind it want more and more of is people who can run a
team of agents and operate an LLM well, and fewer lone artists hand-writing JavaScript.
