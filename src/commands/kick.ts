import { MessageMentions, EmbedBuilder } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { Kick } from '@/models/kicks';
import { Ban } from '@/models/bans';
import { ordinal, sendEventLogMessage } from '@/util';
import type { ChatInputCommandInteraction } from 'discord.js';

async function kickHandler(interaction: ChatInputCommandInteraction): Promise<void> {
	await interaction.deferReply({
		ephemeral: true
	});

	const guild = await interaction.guild!.fetch();
	const executor = interaction.user;
	const users = interaction.options.getString('users', true);
	const reason = interaction.options.getString('reason', true);

	const userIds = [...new Set(Array.from(users.matchAll(new RegExp(MessageMentions.UsersPattern, 'g')), match => match[1]))];

	const kicksListEmbed = new EmbedBuilder();
	kicksListEmbed.setTitle('User Kicks :thumbsdown:');
	kicksListEmbed.setColor(0xFFA500);

	for (const userId of userIds) {
		const member = await interaction.guild!.members.fetch(userId);
		const user = member.user;

		const eventLogEmbed = new EmbedBuilder();

		eventLogEmbed.setDescription('――――――――――――――――――――――――――――――――――');
		eventLogEmbed.setTimestamp(Date.now());
		eventLogEmbed.setFields(
			{
				name: 'User',
				value: `<@${user.id}>`
			},
			{
				name: 'User ID',
				value: user.id
			},
			{
				name: 'Executor',
				value: `<@${executor.id}>`
			},
			{
				name: 'Executor User ID',
				value: executor.id
			},
			{
				name: 'Reason',
				value: reason
			},
			{
				name: 'From bot /kick command',
				value: 'true'
			}
		);
		eventLogEmbed.setFooter({
			text: 'Pretendo Network',
			iconURL: guild.iconURL() ?? undefined
		});

		const { count, rows } = await Kick.findAndCountAll({
			where: {
				user_id: member.id
			}
		});

		let isKick;
		let isBan;

		const sendMemberEmbeds = [];

		if (count >= 2) { // Atleast 2 previous kicks, this would be the 3rd strike. Ban
			eventLogEmbed.setColor(0xF24E43);
			eventLogEmbed.setTitle('Event Type: _Member Banned_');
			
			const banEmbed = new EmbedBuilder();

			banEmbed.setTitle('Punishment Details');
			banEmbed.setDescription('You have been banned from the Pretendo Network server. You may not rejoin at this time, and an appeal may not be possible\nYou may review the details of your ban below');
			banEmbed.setColor(0xF24E43);
			banEmbed.setTimestamp(Date.now());
			banEmbed.setAuthor({
				name: `Banned by: ${executor.tag}`,
				iconURL: executor.avatarURL() ?? undefined
			});
			banEmbed.setFooter({
				text: 'Pretendo Network',
				iconURL: guild.iconURL()!
			});
			banEmbed.setFields(
				{
					name: 'Ban Reason',
					value: reason
				},
				{
					name: 'From kick',
					value: 'This ban was the result of being kicked 3 times. Below is a list of all previous kicks'
				}
			);

			isBan = true;

			sendMemberEmbeds.push(banEmbed);
		} else { // Just kick
			eventLogEmbed.setColor(0xEF7F31);
			eventLogEmbed.setTitle('Event Type: _Member Kicked_');

			const kickEmbed = new EmbedBuilder();

			kickEmbed.setTitle('Punishment Details');
			kickEmbed.setDescription('You have been kicked from the Pretendo Network server. You may rejoin after reviewing the details of the kick below');
			kickEmbed.setColor(0xEF7F31);
			kickEmbed.setTimestamp(Date.now());
			kickEmbed.setAuthor({
				name: `Kicked by: ${executor.tag}`,
				iconURL: executor.avatarURL() ?? undefined
			});
			kickEmbed.setFooter({
				text: 'Pretendo Network',
				iconURL: guild.iconURL()!
			});
			kickEmbed.setFields({
				name: 'Kick Reason',
				value: reason
			});

			isKick = true;

			sendMemberEmbeds.push(kickEmbed);
		}

		await sendEventLogMessage(guild, null, eventLogEmbed);

		if (count > 0) {
			const pastKicksEmbed = new EmbedBuilder();
			pastKicksEmbed.setTitle('Past Kicks');
			pastKicksEmbed.setDescription('For clarifty purposes here is a list of your past kicks');
			pastKicksEmbed.setColor(0xEF7F31);
			pastKicksEmbed.setTimestamp(Date.now());
			pastKicksEmbed.setFooter({
				text: 'Pretendo Network',
				iconURL: guild.iconURL()!
			});

			for (let i = 0; i < rows.length; i++) {
				const kick = rows[i];
				const kickedBy = await interaction.client.users.fetch(kick.admin_user_id);

				pastKicksEmbed.addFields(
					{
						name: `${ordinal(i + 1)} Kick`,
						value: kick.reason
					},
					{
						name: 'Punished By',
						value: kickedBy.tag,
						inline: true
					},
					{
						name: 'Date',
						value: kick.timestamp.toLocaleDateString(),
						inline: true
					}
				);
			}

			sendMemberEmbeds.push(pastKicksEmbed);
		}

		await member.send({
			embeds: sendMemberEmbeds
		}).catch(() => console.log('Failed to DM user'));

		if (isKick) {
			await member.kick(reason);
		} else if (isBan) {
			await member.ban({
				reason
			});

			await Ban.create({
				user_id: member.id,
				admin_user_id: executor.id,
				reason: reason,
				from_kick: true
			});
		} else {
			// ???
		}

		await Kick.create({
			user_id: member.id,
			admin_user_id: executor.id,
			reason: reason
		});

		kicksListEmbed.addFields([
			{ name: `${member.user.username}'s kicks`, value: (count + 1).toString(), inline: true }
		]);
	}

	await interaction.editReply({ embeds: [kicksListEmbed] });
}

const command = new SlashCommandBuilder()
	.setName('kick')
	.setDescription('Kick user(s)')
	.addStringOption(option => {
		return option.setName('users')
			.setDescription('User(s) to kick')
			.setRequired(true);
	})
	.addStringOption(option => {
		return option.setName('reason')
			.setDescription('Reason for the kick')
			.setRequired(true);
	});

export default {
	name: command.name,
	handler: kickHandler,
	deploy: command.toJSON()
};